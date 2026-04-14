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
 */

import type { Message, Adapter, ToolCall, ToolResult } from './types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { buildSystemPrompt } from './promptBuilder.js';
import { getProvider } from '../providers/registry.js';
import { getToolSchemas, dispatch } from '../tools/registry.js';
import { getOrCreateSession, createSession, loadMessages, saveMessages, updateSessionTitle } from '../storage/sessionStore.js';
import { agentLogger } from '../lib/logger.js';

// Import tools to trigger self-registration
import '../tools/fileTools.js';
import '../tools/shellTool.js';
import '../tools/webSearch.js';
import '../tools/memoryTools.js';
import '../tools/skillTools.js';
import '../tools/clarifyTools.js';
import '../tools/telegramTools.js';

// ── Model Pricing (per 1M tokens) ────────────────────────────────────────────
// Used for cost estimation in logs. Codex OAuth calls are subscription-based
// (effectively free), but we log the equivalent API cost for monitoring.

interface ModelPricing {
  input: number;
  cached: number;
  output: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini
  'gemini-3-flash-preview':   { input: 0.50, cached: 0.05, output: 3.00 },
  'gemini-3-flash':           { input: 0.50, cached: 0.05, output: 3.00 },
  'gemini-3-pro':             { input: 2.50, cached: 0.25, output: 15.00 },

  // OpenAI
  'gpt-5.4':                  { input: 2.50, cached: 1.25, output: 15.00 },
  'gpt-5.4-mini':             { input: 0.75, cached: 0.375, output: 4.50 },
  'gpt-5.4-nano':             { input: 0.20, cached: 0.10,  output: 1.25 },

  // Fallback
  'default':                  { input: 1.00, cached: 0.10, output: 5.00 },
};

/** Options for {@link Agent.run}. */
export interface RunOptions {
  /** Session key for history persistence (e.g., 'tg:12345' or 'cli:local'). */
  sessionKey: string;
  /** Explicit session ID. If omitted, resolved from sessionKey. */
  sessionId?: string;
  /** Force creation of a new session, discarding previous history. */
  newSession?: boolean;
}

/** Result returned by {@link Agent.run} after the ReAct loop completes. */
export interface RunResult {
  /** Final text content to display to the user. */
  content: string;
  /** The session ID used for this run (for persistence tracking). */
  sessionId: string;
  /** Total number of tool calls executed during this run. */
  toolCallCount: number;
  /** Whether the tg tool already sent a message to the user. */
  tgSent: boolean;
}

/**
 * The Anya Agent — core ReAct (Reason + Act) loop.
 *
 * Platform-agnostic: communicates with the user exclusively through
 * the {@link Adapter} interface. Each platform (CLI, Telegram) provides
 * its own adapter implementation.
 *
 * Lifecycle per user message:
 * 1. Load/create session and conversation history from SQLite
 * 2. Build system prompt (SOUL.md + memory + skills)
 * 3. Sanitize history for provider compatibility
 * 4. Enter ReAct loop: call LLM → execute tools → repeat
 * 5. Save new messages to session history
 * 6. Return final text response
 */
export class Agent {
  private config: AnyaConfig;
  private adapter: Adapter;

  /**
   * @param config - Agent configuration (model, tools, limits, etc.)
   * @param adapter - Platform adapter for user interaction
   */
  constructor(config: AnyaConfig, adapter: Adapter) {
    this.config = config;
    this.adapter = adapter;
  }

  /**
   * Run the agent with a user input message.
   *
   * This is the main entry point. It manages the full ReAct loop:
   * loading history, calling the LLM, executing tool calls, and
   * returning the final response.
   *
   * @param input - The user's message text.
   * @param options - Session and run configuration.
   * @returns The agent's response content, session ID, and tool call count.
   * @throws Re-throws LLM provider errors after max retries.
   */
  async run(input: string, options: RunOptions): Promise<RunResult> {
    const { sessionKey, newSession } = options;
    let { sessionId } = options;

    // Get or create session
    if (!sessionId) {
      sessionId = newSession
        ? createSession(sessionKey)
        : getOrCreateSession(sessionKey);
    }

    // Load existing conversation history
    let history = loadMessages(sessionId);
    const maxHistory = this.config.advanced.max_history_messages || 50;

    if (history.length > maxHistory) {
      // Keep only the most recent N messages, but ensure we don't sever a tool call from its result
      let sliceIndex = history.length - maxHistory;
      while (sliceIndex < history.length && history[sliceIndex].role === 'tool') {
        sliceIndex--; // Back up to include the assistant message that made the tool call
      }
      history = history.slice(Math.max(0, sliceIndex));
      agentLogger.info({ msg: 'history_truncated', sliced: history.length });
    }

    // Sanitize history to comply with Gemini's strict turn ordering:
    // - assistant(toolCalls) must be immediately followed by tool results
    // - No orphaned tool results without a preceding assistant toolCall
    // - History must start with a user message (not assistant/tool)
    history = this.sanitizeHistory(history);

    // Build system prompt
    const systemPrompt = buildSystemPrompt(this.config);

    // Prepare messages for LLM
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: input },
    ];

    // Track new messages to save
    const newMessages: Message[] = [
      { role: 'user', content: input },
    ];

    // Auto-title the session from first user message
    if (history.length === 0) {
      const title = input.length > 50 ? input.substring(0, 50) + '...' : input;
      updateSessionTitle(sessionId, title);
    }

    const maxLoops = this.config.advanced.max_react_loops;
    let totalToolCalls = 0;
    let tgSent = false;

    // --- ReAct Loop ---
    for (let loop = 0; loop < maxLoops; loop++) {
      // Get tool schemas — include tg tool only when running via Telegram
      const isTelegram = this.adapter.constructor.name === 'TelegramSessionAdapter';
      const toolSchemas = getToolSchemas(this.config, isTelegram);

      // Call LLM — resolve active provider and model
      const activeProvider = this.config.provider.active;
      const model = activeProvider === 'openai'
        ? this.config.provider.openai.model
        : this.config.provider.gemini.model;
      const provider = getProvider(model);
      const response = await provider.chat(messages, toolSchemas, this.config, { sessionId });

      // Single consolidated log per LLM call
      const u = response.usage;
      const logEntry: Record<string, unknown> = {
        msg: 'llm_call',
        model,
        sessionId,
        loop,
        duration_ms: response.durationMs || 0,
      };

      if (u) {
        const cached = u.cachedTokens || 0;
        const thoughts = u.thoughtsTokens || 0;
        const inputNonCached = u.promptTokens - cached;

        // Per-model pricing (per 1M tokens)
        const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
        const cost = (inputNonCached / 1_000_000) * pricing.input
          + (cached / 1_000_000) * pricing.cached
          + (u.completionTokens / 1_000_000) * pricing.output
          + (thoughts / 1_000_000) * pricing.output;

        Object.assign(logEntry, {
          tokens: { in: u.promptTokens, out: u.completionTokens, cached, thoughts, total: u.totalTokens },
          cost: `$${cost.toFixed(6)}`,
        });
      }

      logEntry.tools = response.toolCalls?.length || 0;
      logEntry.hasContent = !!response.content;
      agentLogger.info(logEntry);

      // --- Case 1: Tool calls ---
      if (response.toolCalls && response.toolCalls.length > 0) {
        totalToolCalls += response.toolCalls.length;

        // Add assistant message with tool calls
        const assistantMsg: Message = {
          role: 'assistant',
          content: response.content || undefined,
          toolCalls: response.toolCalls,
          // Preserve raw model parts for round-tripping (thought_signature etc)
          _rawParts: response.rawModelParts,
        };
        messages.push(assistantMsg);
        newMessages.push(assistantMsg);

        // Execute each tool call
        for (const toolCall of response.toolCalls) {
          // Show tool call to user
          if (this.config.ui.show_tool_calls && this.adapter.showToolCall) {
            this.adapter.showToolCall(toolCall.name, toolCall.args);
          }

          // Execute the tool
          const result = await dispatch(toolCall.name, toolCall.args, {
            adapter: this.adapter,
            config: this.config,
          });

          // Track if tg tool sent a message to the user
          if (toolCall.name === 'tg' && !result.startsWith('Error')) {
            tgSent = true;
          }

          const isError = result.startsWith('Error');

          // Show tool result to user
          if (this.config.ui.show_tool_calls && this.adapter.showToolResult) {
            this.adapter.showToolResult(toolCall.name, result, isError);
          }

          // Add tool result to messages
          const toolMsg: Message = {
            role: 'tool',
            content: result,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          };
          messages.push(toolMsg);
          newMessages.push(toolMsg);
        }

        // Continue the loop -- LLM will see tool results and decide next action
        continue;
      }

      // --- Case 2: Text response (final answer) ---
      const finalContent = response.content || '';

      const assistantMsg: Message = {
        role: 'assistant',
        content: finalContent,
      };
      newMessages.push(assistantMsg);

      // Save all new messages to the database
      saveMessages(sessionId, newMessages);

      return {
        content: finalContent,
        sessionId,
        toolCallCount: totalToolCalls,
        tgSent,
      };
    }

    // --- Max loops reached ---
    const fallbackMsg = 'Warning: Maximum loop count reached. Please try simplifying your request.';
    newMessages.push({ role: 'assistant', content: fallbackMsg });
    saveMessages(sessionId, newMessages);

    return {
      content: fallbackMsg,
      sessionId,
      toolCallCount: totalToolCalls,
      tgSent,
    };
  }

  /**
   * Sanitize conversation history to comply with Gemini's strict turn ordering.
   *
   * Gemini requires:
   *   1. Conversation starts with 'user' (after system)
   *   2. assistant with toolCalls is immediately followed by matching tool results
   *   3. No orphaned tool messages
   *   4. Alternating user/assistant turns (no consecutive same-role)
   *
   * This method drops invalid sequences rather than crashing.
   */
  private sanitizeHistory(history: Message[]): Message[] {
    if (history.length === 0) return history;

    const result: Message[] = [];

    // Skip leading non-user messages (history should start with user)
    let startIdx = 0;
    while (startIdx < history.length && history[startIdx].role !== 'user') {
      agentLogger.warn({ msg: 'history_sanitize_skip_leading', role: history[startIdx].role });
      startIdx++;
    }

    for (let i = startIdx; i < history.length; i++) {
      const msg = history[i];

      if (msg.role === 'tool') {
        // Tool messages are only valid after an assistant with toolCalls
        const prev = result[result.length - 1];
        if (prev && (prev.role === 'assistant' && prev.toolCalls) || (prev && prev.role === 'tool')) {
          result.push(msg);
        } else {
          agentLogger.warn({ msg: 'history_sanitize_drop_orphan_tool', toolName: msg.toolName });
          // Skip orphaned tool message
        }
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant with tool calls — verify that tool results follow
        const expectedToolIds = new Set(msg.toolCalls.map(tc => tc.id));
        let j = i + 1;
        const toolResults: Message[] = [];
        while (j < history.length && history[j].role === 'tool') {
          toolResults.push(history[j]);
          j++;
        }

        if (toolResults.length > 0) {
          // Valid tool call + results sequence
          result.push(msg);
          for (const tr of toolResults) {
            result.push(tr);
          }
          i = j - 1; // skip past tool results (loop will i++)
        } else {
          // Orphaned tool call with no results — drop it
          agentLogger.warn({ msg: 'history_sanitize_drop_orphan_toolcall', tools: msg.toolCalls.map(t => t.name) });
        }
      } else {
        // Regular user or assistant message
        result.push(msg);
      }
    }

    if (result.length !== history.length) {
      agentLogger.info({ msg: 'history_sanitized', original: history.length, cleaned: result.length });
    }

    return result;
  }
}
