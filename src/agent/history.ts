// agent/history.ts — history truncation, sanitization, practice compaction

import type { Message, ToolCall } from './types.js';
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

// Replace each completed-practice turn (an assistant message whose toolCalls
// include `persist({action:"practice", completed:1})`) plus its trailing tool
// results with a single short summary message. Keeps "what user asked / what
// was practiced / how they did" while dropping bulky SKILL.md, tts blobs, etc.
export function compactCompletedPractice(history: Message[]): Message[] {
  const result: Message[] = [];
  let compactedCount = 0;
  let i = 0;

  while (i < history.length) {
    const msg = history[i];

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const hasCompletedPractice = msg.toolCalls.some(isCompletedPracticeCall);

      if (hasCompletedPractice) {
        let j = i + 1;
        while (j < history.length && history[j].role === 'tool') j++;

        result.push({
          role: 'assistant',
          content: buildPracticeSummary(msg.toolCalls),
        });
        compactedCount += (j - i);
        i = j;
        continue;
      }
    }

    result.push(msg);
    i++;
  }

  if (compactedCount > 0) {
    agentLogger.info({
      msg: 'history_practice_compacted',
      original: history.length,
      compacted: result.length,
      removed: compactedCount - (history.length - result.length === compactedCount ? 0 : 0),
    });
  }

  return result;
}

// Practice writes (action="practice", or omitted — default action). `completed`
// defaults to 1 on the persist side, so we match when it's 1 OR absent. Reads
// like `action="recent_practice"` never have `prompt`/`response`, so we also
// require at least one of those to be present to avoid matching queries.
function isCompletedPracticeCall(tc: ToolCall): boolean {
  if (tc.name !== 'persist') return false;
  const a = tc.args || {};
  const action = a.action;
  if (action !== undefined && action !== 'practice') return false;
  const completed = a.completed === undefined ? 1 : toCompletedFlag(a.completed);
  if (completed !== 1) return false;
  return a.prompt !== undefined || a.response !== undefined || a.feedback !== undefined;
}

function toCompletedFlag(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.substring(0, max) + '…' : s;
}

function buildPracticeSummary(toolCalls: ToolCall[]): string {
  const lines: string[] = [];
  for (const tc of toolCalls) {
    if (isCompletedPracticeCall(tc)) {
      const a = tc.args || {};
      const skillType = String(a.skill_type || 'practice');
      const acc = a.accuracy != null ? ` acc=${a.accuracy}` : '';
      const score = a.raw_score != null ? ` ${a.raw_score}/${a.max_score ?? '?'}` : '';
      lines.push(`[Past practice ${skillType}${acc}${score}]`);
      if (a.prompt) lines.push(`  Q: ${truncate(String(a.prompt), 200)}`);
      if (a.response) lines.push(`  A: ${truncate(String(a.response), 200)}`);
      if (a.feedback) lines.push(`  F: ${truncate(String(a.feedback), 200)}`);
    } else if (tc.name === 'tg_msg' && tc.args?.text) {
      // Preserve final user-facing text so the LLM remembers what it just said.
      lines.push(`  [Sent: ${truncate(String(tc.args.text), 300)}]`);
    }
  }
  return lines.join('\n');
}
