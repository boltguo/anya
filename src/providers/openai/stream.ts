/**
 * @module providers/openai/stream
 * @description Server-Sent Events (SSE) consumption logic for Codex streams.
 *
 * Natively parses the raw byte stream emitted by the Codex chunked API without
 * relying on bloated third-party SSE parser libraries.
 */

import type { LLMResponse } from '../../agent/types.js';

/**
 * Aggregates a chunked `fetch` Response stream into a unified `LLMResponse`.
 *
 * Core event processing:
 * - `response.output_item.done` -> Accumulates discrete message blocks or isolated function calls.
 * - `response.completed` -> Finalizes execution, capturing token consumption metrics.
 *
 * @param {Response} response - The active HTTP response object with an open readable body.
 * @param {number} startTime - The exact monotonic timestamp when the request fired (for telemetry).
 * @returns {Promise<LLMResponse>} The fully constructed result object.
 */
export async function consumeStream(response: Response, startTime: number): Promise<LLMResponse> {
  if (!response.body) {
    return { content: '', durationMs: Date.now() - startTime };
  }

  const textParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
  let usage: LLMResponse['usage'] = undefined;

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events (separated by double newlines)
      const events = buffer.split('\n\n');
      // Keep the last potentially incomplete chunk in buffer
      buffer = events.pop() || '';

      for (const eventBlock of events) {
        if (!eventBlock.trim()) continue;

        // Extract data lines from the SSE event
        let data = '';
        for (const line of eventBlock.split('\n')) {
          if (line.startsWith('data: ')) {
            data += line.slice(6);
          } else if (line.startsWith('data:')) {
            data += line.slice(5);
          }
        }

        if (!data || data === '[DONE]') continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        const eventType = event.type as string;

        if (eventType === 'response.output_item.done') {
          const item = event.item as Record<string, unknown> | undefined;
          if (!item) continue;

          const itemType = item.type as string;
          if (itemType === 'message') {
            const content = item.content as Array<{ type: string; text?: string }> | undefined;
            for (const c of content || []) {
              if (c.type === 'output_text' && c.text) textParts.push(c.text);
            }
          } else if (itemType === 'function_call') {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse((item.arguments as string) || '{}');
            } catch { /* malformed arguments — fall back to empty */ }
            toolCalls.push({
              id: (item.call_id as string) || '',
              name: (item.name as string) || '',
              args,
            });
          }
        }

        if (eventType === 'response.completed') {
          const resp = event.response as Record<string, unknown> | undefined;
          if (resp?.usage) {
            const u = resp.usage as Record<string, unknown>;
            const details = u.input_tokens_details as Record<string, unknown> | undefined;
            usage = {
              promptTokens: (u.input_tokens as number) || 0,
              completionTokens: (u.output_tokens as number) || 0,
              totalTokens: (u.total_tokens as number) || 0,
              cachedTokens: (details?.cached_tokens as number) || 0,
            };
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const durationMs = Date.now() - startTime;
  const result: LLMResponse = { durationMs };
  if (textParts.length > 0) result.content = textParts.join('');
  if (toolCalls.length > 0) result.toolCalls = toolCalls;
  if (usage) result.usage = usage;
  return result;
}
