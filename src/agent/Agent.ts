/**
 * @module agent/Agent
 * @description Core ReAct (Reason + Act) agent loop.
 *
 * The Agent orchestrates the conversation between the user, LLM, and tools:
 *
 * ```
 * User Input → [System Prompt + History + Input] → LLM
 *                                                   ↓
 *                                            Tool Calls? ──yes──→ Execute → Feed Results → Loop
 *                                                   ↓ no
 *                                            Text Response → reply() → User
 * ```
 *
 * Each iteration is logged as a single `llm_call` entry with model, tokens,
 * cost, and tool call count. History is persisted to SQLite between sessions.
 *
 * Supporting concerns live in sibling modules:
 *   - {@link ./history} — truncation and Gemini-order sanitization
 */

import type { Message, Adapter, MessageFile } from './types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { buildSystemPrompt } from './promptBuilder.js';
import { OpenAIProvider } from '../providers/openai.js';
import { getToolSchemas, dispatch } from '../tools/registry.js';
import { getOrCreateSession, createSession, loadMessages, saveMessages, updateSessionTitle } from '../storage/sessionStore.js';
import { agentLogger } from '../lib/logger.js';
import { trackLlm } from '../lib/usage.js';
import { truncateHistory, sanitizeHistory } from './history.js';
import { classifyApiError } from './errorClassifier.js';
import { ContextCompressor, estimateTokens } from './contextCompressor.js';

/** Options for {@link Agent.run}. */
export interface RunOptions {
  /** Session key for history persistence (e.g., 'tg:12345'). */
  sessionKey: string;
  /** Explicit session ID. If omitted, resolved from sessionKey. */
  sessionId?: string;
  /** Force creation of a new session, discarding previous history. */
  newSession?: boolean;
  /** Attached files (images) for native multimodal input in this turn. */
  files?: MessageFile[];
}

/** Result returned by {@link Agent.run} after the ReAct loop completes. */
export interface RunResult {
  /** Final text content to display to the user. */
  content: string;
  /** The session ID used for this run (for persistence tracking). */
  sessionId: string;
  /** Total number of tool calls executed during this run. */
  toolCallCount: number;
  /** Whether the tg_msg tool already sent a message to the user. */
  tgSent: boolean;
}

/**
 * The Anya Agent — core ReAct (Reason + Act) loop.
 *
 * Platform-agnostic: communicates with the user exclusively through
 * the {@link Adapter} interface. The platform provides
 * its own adapter implementation.
 * Lifecycle per user message:
 * 1. Load/create session and conversation history from SQLite
 * 2. Build system prompt (config personality + rules + profile + skills)
 * 3. Sanitize history for provider compatibility
 * 4. Enter ReAct loop: call LLM → execute tools → repeat
 * 5. Save new messages to session history
 * 6. Return final text response
 */
export class Agent {
  private config: AnyaConfig;
  private adapter: Adapter;

  constructor(config: AnyaConfig, adapter: Adapter) {
    this.config = config;
    this.adapter = adapter;
  }

  /**
   * Run the agent with a user input message.
   *
   * Main entry point. Manages the full ReAct loop: loading history, calling
   * the LLM, executing tool calls, and returning the final response.
   *
   * @throws Re-throws LLM provider errors after max retries.
   */
  async run(input: string, options: RunOptions): Promise<RunResult> {
    const { sessionKey, newSession, files } = options;
    let { sessionId } = options;

    if (!sessionId) {
      sessionId = newSession
        ? await createSession(sessionKey)
        : await getOrCreateSession(sessionKey);
    }

    let history = loadMessages(sessionId);
    const maxHistory = this.config.advanced.max_history_messages || 200;
    history = truncateHistory(history, maxHistory);
    history = sanitizeHistory(history);

    const systemPrompt = buildSystemPrompt(this.config);

    // Timestamp is appended to user input (not system prompt) to keep the
    // system prompt stable across turns, maximising prompt cache hit rate.
    const timestampedInput = `[${new Date().toISOString()}] ${input}`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: timestampedInput, files },
    ];

    const newMessages: Message[] = [
      { role: 'user', content: input, files },
    ];

    // Auto-title the session from first user message.
    if (history.length === 0) {
      const title = input.length > 50 ? input.substring(0, 50) + '...' : input;
      await updateSessionTitle(sessionId, title);
    }

    const maxLoops = this.config.advanced.max_react_loops;
    const contextLimit = this.config.advanced.context_window;
    const compressor = new ContextCompressor(this.config);
    let totalToolCalls = 0;
    let tgSent = false;
    let compressionCount = 0;
    const MAX_COMPRESSIONS = 3;
    let lastRealTokenCount = 0;
    let firstLlmCall = true;  // Track whether images have been seen by LLM

    // ── ReAct Loop ──
    for (let loop = 0; loop < maxLoops; loop++) {

      // ── Pre-flight: compress context if approaching the limit ──
      // Use real token count from last LLM response if available, else estimate
      const tokenCount = lastRealTokenCount || estimateTokens(messages, this.config.tools.enabled.length);
      if (compressor.shouldCompress(messages, tokenCount, contextLimit) && compressionCount < MAX_COMPRESSIONS) {
        compressionCount++;
        const compressed = await compressor.compress(messages, contextLimit);
        messages.length = 0;
        messages.push(...compressed);
        lastRealTokenCount = 0; // Reset — re-estimate after compression
      }

      const isTelegram = this.adapter.platform === 'telegram';
      const toolSchemas = getToolSchemas(this.config, isTelegram);

      const model = this.config.provider.model;
      const provider = new OpenAIProvider();

      let response;
      try {
        response = await provider.chat(messages, toolSchemas, this.config, { sessionId });

        // After the first LLM call that saw the images, strip inlineData from
        // all messages to avoid re-uploading MB of base64 in subsequent loops.
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

        // Context overflow → compress and retry
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

      // Track real token usage for accurate pre-flight checks
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

      // Track LLM token usage
      if (u) {
        trackLlm(u.promptTokens || 0, u.completionTokens || 0, u.cachedTokens || 0);
      }

      // ── Case 1: Tool calls ──
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

          if (toolCall.name === 'tg_msg' && !result.isError) {
            tgSent = true;
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

      // ── Case 2: Text response (final answer) ──
      const finalContent = response.content || '';

      const assistantMsg: Message = {
        role: 'assistant',
        content: finalContent,
        _rawParts: response.rawModelParts,
      };
      newMessages.push(assistantMsg);

      // Degrade multimodal messages before persisting — strip files, keep text placeholder
      const degraded = degradeForStorage(newMessages);
      await saveMessages(sessionId, degraded);

      return {
        content: finalContent,
        sessionId,
        toolCallCount: totalToolCalls,
        tgSent,
      };
    }

    // ── Max loops reached ──
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
 * Degrade multimodal messages for SQLite persistence.
 *
 * Strips the transient `files` field and replaces it with a lightweight
 * text placeholder. This prevents MB-scale base64 blobs from entering
 * the conversation history, while preserving a human-readable note that
 * images were present.
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
