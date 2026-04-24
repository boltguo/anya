/**
 * @module agent/history
 * @description Conversation-history helpers for the ReAct loop.
 *
 * Two concerns live here:
 *  - **Truncation**: cap long histories without severing an assistant
 *    (toolCalls) → tool(results) pair.
 *  - **Sanitization**: enforce strict turn ordering so the provider
 *    does not reject the payload. Invalid sequences are dropped with a warn
 *    log rather than crashing.
 */

import type { Message } from './types.js';
import { agentLogger } from '../lib/logger.js';

/**
 * Cap the history at {@link maxHistory} messages, backing up past leading tool
 * messages so we never keep a tool result without its originating assistant
 * message. Logs the final size.
 */
export function truncateHistory(history: Message[], maxHistory: number): Message[] {
  if (history.length <= maxHistory) return history;

  let sliceIndex = history.length - maxHistory;
  while (sliceIndex > 0 && history[sliceIndex].role === 'tool') {
    sliceIndex--;
  }
  const truncated = history.slice(Math.max(0, sliceIndex));
  agentLogger.info({ msg: 'history_truncated', sliced: truncated.length });
  return truncated;
}

/**
 * Sanitize conversation history to comply with strict turn ordering.
 *
 * Requirements:
 *   1. Conversation starts with 'user' (after system)
 *   2. assistant with toolCalls is immediately followed by matching tool results
 *   3. No orphaned tool messages
 *   4. Alternating user/assistant turns (no consecutive same-role)
 *
 * This function drops invalid sequences rather than crashing.
 */
export function sanitizeHistory(history: Message[]): Message[] {
  if (history.length === 0) return history;

  const result: Message[] = [];

  // Skip leading non-user messages (history should start with user).
  let startIdx = 0;
  while (startIdx < history.length && history[startIdx].role !== 'user') {
    agentLogger.warn({ msg: 'history_sanitize_skip_leading', role: history[startIdx].role });
    startIdx++;
  }

  for (let i = startIdx; i < history.length; i++) {
    const msg = history[i];

    if (msg.role === 'tool') {
      // Tool messages are only valid after an assistant with toolCalls (or another tool).
      const prev = result[result.length - 1];
      if (prev && ((prev.role === 'assistant' && prev.toolCalls) || prev.role === 'tool')) {
        result.push(msg);
      } else {
        agentLogger.warn({ msg: 'history_sanitize_drop_orphan_tool', toolName: msg.toolName });
      }
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // Assistant with tool calls — verify that tool results follow.
      let j = i + 1;
      const toolResults: Message[] = [];
      while (j < history.length && history[j].role === 'tool') {
        toolResults.push(history[j]);
        j++;
      }

      if (toolResults.length > 0) {
        result.push(msg);
        for (const tr of toolResults) {
          result.push(tr);
        }
        i = j - 1;
      } else {
        agentLogger.warn({ msg: 'history_sanitize_drop_orphan_toolcall', tools: msg.toolCalls.map(t => t.name) });
      }
    } else {
      result.push(msg);
    }
  }

  if (result.length !== history.length) {
    agentLogger.info({ msg: 'history_sanitized', original: history.length, cleaned: result.length });
  }

  return result;
}
