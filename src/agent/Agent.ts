import type { Message, Adapter, ToolCall, ToolResult } from './types.js';
import type { VelaConfig } from '../config/defaults.js';
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

export interface RunOptions {
  sessionKey: string;
  sessionId?: string;
  newSession?: boolean;
}

export interface RunResult {
  content: string;
  sessionId: string;
  toolCallCount: number;
}

/**
 * The Vela Agent -- core ReAct loop.
 *
 * Flow:
 * 1. Load session history from SQLite
 * 2. Build system prompt
 * 3. Call LLM provider
 * 4. If tool calls: execute tools, feed results back, repeat
 * 5. If text response: return to user
 * 6. Save updated history
 */
export class Agent {
  private config: VelaConfig;
  private adapter: Adapter;

  constructor(config: VelaConfig, adapter: Adapter) {
    this.config = config;
    this.adapter = adapter;
  }

  /**
   * Run the agent with a user input.
   * This is the main entry point -- the ReAct loop.
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
    const history = loadMessages(sessionId);

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

    // --- ReAct Loop ---
    for (let loop = 0; loop < maxLoops; loop++) {
      agentLogger.debug({
        msg: 'react_loop',
        iteration: loop,
        messageCount: messages.length,
      });

      // Get tool schemas for this call
      const toolSchemas = getToolSchemas(this.config);

      // Call LLM
      const provider = getProvider(this.config.provider.primary);
      const response = await provider.chat(messages, toolSchemas, this.config);

      // Log usage
      if (response.usage) {
        agentLogger.info({
          msg: 'token_usage',
          prompt: response.usage.promptTokens,
          completion: response.usage.completionTokens,
          total: response.usage.totalTokens,
        });
      }

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
    };
  }
}
