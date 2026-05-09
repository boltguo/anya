/**
 * @module agent/Agent
 * @description Core ReAct (Reason + Act) agent loop.
 *
 * The Agent orchestrates the conversation between the user, LLM, and tools:
 *
 * ```text
 * User Input → [System Prompt + History + Input] → LLM
 *                                                   ↓
 *                                            Tool Calls? ──yes──→ Execute → Feed Results → Loop
 *                                                   ↓ no
 *                                            Text Response → reply() → User
 * ```
 *
 * Each iteration is logged as a single `llm_call` entry including model details,
 * token usage, cost, and tool call counts. Conversation history is persisted to SQLite
 * between sessions.
 *
 * Supporting concerns live in sibling modules:
 * - {@link module:agent/history} — Manages truncation and turn-order sanitization.
 */

import type { Message, Adapter, MessageFile, LLMProvider } from './types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { buildSystemPrompt } from './promptBuilder.js';
import { createProvider } from '../providers/index.js';
import { getToolSchemas, dispatch } from '../tools/registry.js';
import { getOrCreateSession, createSession, loadMessages, saveMessages, updateSessionTitle, getActiveSkill, setActiveSkill } from '../storage/sessionStore.js';
import { getSkill } from '../skills/loader.js';
import { agentLogger } from '../lib/logger.js';
import { trackLlm } from '../lib/usage.js';
import { truncateHistory, sanitizeHistory } from './history.js';
import { classifyApiError } from './errorClassifier.js';
import { ContextCompressor, estimateTokens } from './contextCompressor.js';

/**
 * Defines the per-run tool filtering policy.
 */
export interface ToolPolicy {
  /** Whitelist array of allowed tool names. If provided, overrides the deny list. */
  allow?: string[];
  /** Blacklist array of tool names to exclude from the run. */
  deny?: string[];
}

/**
 * Configuration options for the {@link Agent.run} execution.
 */
export interface RunOptions {
  /** Unique session key used for history persistence (e.g., 'tg:12345'). */
  sessionKey: string;
  /** Explicit session ID. If omitted, it is resolved internally from the sessionKey. */
  sessionId?: string;
  /** When true, forces the creation of a new session and discards previous history. */
  newSession?: boolean;
  /** Attached files (e.g., images) for native multimodal input in this specific turn. */
  files?: MessageFile[];
  /** Per-run tool filtering policy to allow or deny specific tools dynamically. */
  toolPolicy?: ToolPolicy;
}

/**
 * The structured result returned by {@link Agent.run} after completing the ReAct loop.
 */
export interface RunResult {
  /** The final text content intended for display to the user. */
  content: string;
  /** The active session ID used during this run, useful for persistence tracking. */
  sessionId: string;
  /** The total number of tool calls executed during this run. */
  toolCallCount: number;
  /** Indicates whether the telegram message tool has already sent a response to the user. */
  tgSent: boolean;
}

/**
 * The core Anya Agent encapsulating the ReAct (Reason + Act) loop.
 *
 * Platform-agnostic by design, it communicates with users exclusively through
 * the {@link Adapter} interface. The lifecycle per user message involves:
 * 1. Loading or creating session and conversation history from SQLite.
 * 2. Building the system prompt (incorporating personality, rules, profile, and skills).
 * 3. Sanitizing history for provider compatibility.
 * 4. Executing the ReAct loop: invoking the LLM, executing tool calls, and repeating.
 * 5. Saving new messages to the session history.
 * 6. Returning the final text response.
 */
export class Agent {
  private config: AnyaConfig;
  private adapter: Adapter;
  private provider: LLMProvider;

  /**
   * Initializes a new instance of the Agent.
   *
   * @param config - The application configuration.
   * @param adapter - The platform-specific interface adapter.
   */
  constructor(config: AnyaConfig, adapter: Adapter) {
    this.config = config;
    this.adapter = adapter;
    this.provider = createProvider(config);
  }

  /**
   * Executes the agent loop with the provided user input.
   *
   * This is the main entry point. It manages the full ReAct loop: fetching history,
   * querying the LLM, executing tool calls, and returning the definitive response.
   *
   * @param input - The raw text input from the user.
   * @param options - Execution options dictating session and tool policies.
   * @returns A promise resolving to the final {@link RunResult}.
   * @throws Rethrows unrecoverable LLM provider errors after exhausting max retries.
   */
  async run(input: string, options: RunOptions): Promise<RunResult> {
    const { sessionKey, newSession, files, toolPolicy } = options;
    let { sessionId } = options;

    if (!sessionId) {
      sessionId = newSession
        ? await createSession(sessionKey)
        : await getOrCreateSession(sessionKey);
    }

    let history = loadMessages(sessionId);
    const maxHistory = this.config.advanced.max_history_messages || 200;
    history = truncateHistory(history, maxHistory);
    history = trimOldToolResults(history);
    history = sanitizeHistory(history);

    // Build system prompt with session-level active skill injection
    const baseSystemPrompt = buildSystemPrompt(this.config);
    const activeSkillName = getActiveSkill(sessionId);
    let systemPrompt = baseSystemPrompt;
    if (activeSkillName) {
      const skill = getSkill(activeSkillName);
      if (skill) {
        systemPrompt = `${baseSystemPrompt}\n\n## Active Skill Instructions (${activeSkillName})\n\n${skill.body}`;
      }
    }

    // Append timestamp to user input rather than the system prompt to maintain
    // system prompt stability across turns, optimizing cache hit rates.
    const timestampedInput = `[${new Date().toISOString()}] ${input}`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: timestampedInput, files },
    ];

    const newMessages: Message[] = [
      { role: 'user', content: input, files },
    ];

    // Generate and update an automatic session title from the first user message.
    if (history.length === 0) {
      const title = input.length > 50 ? input.substring(0, 50) + '...' : input;
      await updateSessionTitle(sessionId, title);
    }

    const maxLoops = this.config.advanced.max_react_loops;
    const contextLimit = this.config.advanced.context_window;
    const compressor = new ContextCompressor(this.config, this.provider);
    let totalToolCalls = 0;
    let tgSent = false;
    let compressionCount = 0;
    const MAX_COMPRESSIONS = 3;
    let lastRealTokenCount = 0;
    let firstLlmCall = true;

    // ── ReAct Loop ──
    for (let loop = 0; loop < maxLoops; loop++) {

      // Evaluate context length; compress if threshold exceeded.
      const tokenCount = lastRealTokenCount || estimateTokens(messages, this.config.tools.enabled.length);
      if (compressor.shouldCompress(messages, tokenCount, contextLimit) && compressionCount < MAX_COMPRESSIONS) {
        compressionCount++;
        const compressed = await compressor.compress(messages, contextLimit);
        messages.length = 0;
        messages.push(...compressed);
        lastRealTokenCount = 0;
      }

      const toolSchemas = getToolSchemas(this.config, this.adapter.platform, toolPolicy);
      const model = this.config.provider.model;
      const provider = this.provider;

      let response;
      try {
        response = await provider.chat(messages, toolSchemas, this.config, { sessionId });

        // Strip inline file data after the initial LLM call to prevent
        // repetitive base64 uploads in subsequent loops.
        if (firstLlmCall && files && files.length > 0) {
          firstLlmCall = false;
          for (const m of messages) {
            if (m.files) {
              m.content = `[📷 ${m.files.length} image(s) attached — already processed]\n${m.content || ''}`.trim();
              delete m.files;
            }
          }
        } else {
          firstLlmCall = false;
        }
      } catch (err) {
        const classified = classifyApiError(err);

        // Handle context overflow by compressing and retrying.
        if (classified.shouldCompress && compressionCount < MAX_COMPRESSIONS) {
          compressionCount++;
          agentLogger.warn({ msg: 'context_overflow_recovery', loop, compressionCount });
          const compressed = await compressor.compress(messages, contextLimit);
          messages.length = 0;
          messages.push(...compressed);
          lastRealTokenCount = 0;
          continue;
        }
        throw err;
      }

      if (response.usage?.promptTokens) {
        lastRealTokenCount = response.usage.promptTokens;
      }

      const u = response.usage;
      const logEntry: Record<string, unknown> = {
        msg: 'llm_call',
        model,
        sessionId,
        loop,
        duration_ms: response.durationMs || 0,
      };

      if (u) {
        Object.assign(logEntry, {
          tokens: {
            in: u.promptTokens,
            out: u.completionTokens,
            cached: u.cachedTokens || 0,
            thoughts: u.thoughtsTokens || 0,
            total: u.totalTokens,
          },
        });
      }

      logEntry.tools = response.toolCalls?.length || 0;
      logEntry.hasContent = !!response.content;
      agentLogger.info(logEntry);

      if (u) {
        trackLlm(u.promptTokens || 0, u.completionTokens || 0, u.cachedTokens || 0, this.provider.name);
      }

      // Handle LLM dispatching tool calls.
      if (response.toolCalls && response.toolCalls.length > 0) {
        totalToolCalls += response.toolCalls.length;

        const assistantMsg: Message = {
          role: 'assistant',
          content: response.content || undefined,
          toolCalls: response.toolCalls,
          _rawParts: response.rawModelParts,
        };
        messages.push(assistantMsg);
        newMessages.push(assistantMsg);

        for (const toolCall of response.toolCalls) {
          if (this.config.ui.show_tool_calls && this.adapter.showToolCall) {
            this.adapter.showToolCall(toolCall.name, toolCall.args);
          }

          const result = await dispatch(toolCall.name, toolCall.args, {
            adapter: this.adapter,
            config: this.config,
            sessionId,
          });

          // Persist active skill to session when skill_view loads a valid SKILL.md
          if (toolCall.name === 'skill_view' && !toolCall.args.file && !result.isError) {
            const skillName = String(toolCall.args.name || '');
            const skill = getSkill(skillName);
            if (skill) {
              await setActiveSkill(sessionId, skillName);
              // Rebuild system prompt with newly activated skill
              messages[0] = {
                role: 'system',
                content: `${buildSystemPrompt(this.config)}\n\n## Active Skill Instructions (${skillName})\n\n${skill.body}`,
              };
              // Replace full body in tool result with short confirmation —
              // body is already in system prompt, no need to duplicate in history
              result.content = `[Skill "${skillName}" loaded — instructions are now in active context]`;
            }
          }

          // Read authoritative sent_content flag from tg_msg result
          if (toolCall.name === 'tg_msg' && !result.isError) {
            try {
              const parsed = JSON.parse(result.content);
              if (parsed.ok && parsed.sent_content) {
                tgSent = true;
              }
            } catch { /* non-JSON result — don't set tgSent */ }
          }

          if (this.config.ui.show_tool_calls && this.adapter.showToolResult) {
            this.adapter.showToolResult(toolCall.name, result.content, result.isError);
          }

          const toolMsg: Message = {
            role: 'tool',
            content: result.content,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          };
          messages.push(toolMsg);
          newMessages.push(toolMsg);
        }

        continue;
      }

      // Handle standard text response denoting loop completion.
      const finalContent = response.content || '';

      const assistantMsg: Message = {
        role: 'assistant',
        content: finalContent,
        _rawParts: response.rawModelParts,
      };
      newMessages.push(assistantMsg);

      const degraded = degradeForStorage(newMessages);
      await saveMessages(sessionId, degraded);

      return {
        content: finalContent,
        sessionId,
        toolCallCount: totalToolCalls,
        tgSent,
      };
    }

    // Resolve max loop limits securely.
    const fallbackMsg = 'Warning: Maximum loop count reached. Please try simplifying your request.';
    newMessages.push({ role: 'assistant', content: fallbackMsg });
    const degraded = degradeForStorage(newMessages);
    await saveMessages(sessionId, degraded);

    return {
      content: fallbackMsg,
      sessionId,
      toolCallCount: totalToolCalls,
      tgSent,
    };
  }
}

// ── Multimodal Degradation ──────────────────────────────────────────────────

/**
 * Degrades multimodal messages to enable SQLite persistence.
 *
 * Strips the transient `files` field and replaces it with a lightweight
 * text placeholder. This prevents MB-scale base64 blobs from inflating
 * the conversation history, while preserving a human-readable record that
 * images were originally included.
 *
 * @param messages - Array of incoming messages that may contain files.
 * @returns A new array of messages structurally safe for persistent storage.
 */
function degradeForStorage(messages: Message[]): Message[] {
  return messages.map(msg => {
    if (msg.files && msg.files.length > 0) {
      const { files, ...rest } = msg;
      return {
        ...rest,
        content: `[📷 User sent ${files.length} image(s)]\n${msg.content || ''}`.trim(),
      };
    }
    return msg;
  });
}

// ── History Tool Result Trimming ────────────────────────────────────────────

/**
 * Number of most-recent tool result messages to preserve at full fidelity.
 * Older tool results are truncated to {@link MAX_OLD_TOOL_CHARS} to reduce
 * prompt token waste from stale SKILL.md bodies, persist JSON, etc.
 */
const KEEP_RECENT_TOOL_RESULTS = 6;
const MAX_OLD_TOOL_CHARS = 200;

/**
 * Truncates old tool interactions in conversation history.
 *
 * Preserves the most recent {@link KEEP_RECENT_TOOL_RESULTS} tool messages
 * at full length. Beyond that threshold:
 * - Tool result content is truncated to {@link MAX_OLD_TOOL_CHARS}.
 * - Assistant messages with toolCalls are stripped to a compact summary
 *   (`[Executed tools: X, Y]`), making their paired tool results orphans.
 *
 * When followed by {@link sanitizeHistory}, orphaned tool messages are dropped
 * entirely. Net effect: old tool interactions shrink from 2+ messages to a
 * single compact assistant message.
 *
 * @param history - The conversation history array (mutated in place).
 * @returns The same array with old tool interactions trimmed.
 */
function trimOldToolResults(history: Message[]): Message[] {
  let toolCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'tool') {
      toolCount++;
      if (toolCount > KEEP_RECENT_TOOL_RESULTS) {
        const content = history[i].content || '';
        if (content.length > MAX_OLD_TOOL_CHARS) {
          history[i] = {
            ...history[i],
            content: content.substring(0, MAX_OLD_TOOL_CHARS) + '\n[...truncated]',
          };
        }
      }
    } else if (history[i].role === 'assistant' && history[i].toolCalls && history[i].toolCalls!.length > 0) {
      if (toolCount > KEEP_RECENT_TOOL_RESULTS) {
        const toolNames = history[i].toolCalls!.map(t => t.name).join(', ');
        history[i] = {
          role: 'assistant',
          content: `[Executed tools: ${toolNames}]\n${history[i].content || ''}`.trim()
        };
      }
    }
  }
  return history;
}

