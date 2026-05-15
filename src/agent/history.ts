// agent/history.ts — history truncation and sanitization

import type { Message } from './types.js';
import { agentLogger } from '../lib/logger.js';

export function truncateHistory(history: Message[], maxHistory: number): Message[] {
  if (history.length <= maxHistory) return history;

  // Back off over leading tool messages so results stay paired with their assistant call.
  let sliceIndex = history.length - maxHistory;
  while (sliceIndex > 0 && history[sliceIndex].role === 'tool') {
    sliceIndex--;
  }
  const truncated = history.slice(Math.max(0, sliceIndex));
  agentLogger.info({ msg: 'history_truncated', sliced: truncated.length });
  return truncated;
}

export function sanitizeHistory(history: Message[]): Message[] {
  if (history.length === 0) return history;

  const result: Message[] = [];

  let startIdx = 0;
  while (startIdx < history.length && history[startIdx].role !== 'user') {
    agentLogger.warn({ msg: 'history_sanitize_skip_leading', role: history[startIdx].role });
    startIdx++;
  }

  for (let i = startIdx; i < history.length; i++) {
    const msg = history[i];

    if (msg.role === 'tool') {
      const prev = result[result.length - 1];
      if (prev && ((prev.role === 'assistant' && prev.toolCalls) || prev.role === 'tool')) {
        result.push(msg);
      } else {
        agentLogger.warn({ msg: 'history_sanitize_drop_orphan_tool', toolName: msg.toolName });
      }
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
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
