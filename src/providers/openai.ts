/**
 * @module providers/openai
 * @description OpenAI LLM provider using the Codex Responses API (streaming).
 *
 * Uses OAuth Bearer token authentication (from auth.json).
 * Base URL: https://chatgpt.com/backend-api/codex
 * Endpoint: POST /responses (stream: true — required by backend)
 *
 * Wire format: Codex Responses API (NOT standard chat/completions).
 * - System message → `instructions` field
 * - User/assistant messages + tool calls → `input` items array
 * - Tool definitions → top-level `tools` array with `type: "function"`
 */

import type { LLMProvider, ChatOptions } from './base.js';
import type { Message, LLMResponse, ToolParameterSchema } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { getCodexAccessToken } from '../lib/auth.js';

/** Codex backend base URL */
const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';

/**
 * Convert our Message[] to Codex Responses input items.
 *
 * Responses API uses a flat array of typed items:
 * - { role: "user", content: "..." }
 * - { role: "assistant", content: "..." }
 * - { type: "function_call", call_id: "...", name: "...", arguments: "..." }
 * - { type: "function_call_output", call_id: "...", output: "..." }
 */
function toResponsesInput(messages: Message[]): {
  instructions: string;
  input: Array<Record<string, unknown>>;
} {
  let instructions = '';
  const input: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      instructions = msg.content || '';
      continue;
    }

    if (msg.role === 'user') {
      input.push({ role: 'user', content: msg.content || '' });
    } else if (msg.role === 'assistant') {
      if (msg.content) {
        input.push({ role: 'assistant', content: msg.content });
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        if (!msg.content) {
          input.push({ role: 'assistant', content: '' });
        }
        for (const tc of msg.toolCalls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          });
        }
      }
    } else if (msg.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: msg.toolCallId || '',
        output: msg.content || '',
      });
    }
  }

  return { instructions, input };
}

/**
 * Convert our tool schemas to Codex Responses function tools.
 */
function toResponsesTools(
  tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
): Array<Record<string, unknown>> {
  return tools.map(t => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: false,
  }));
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  async chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AnyaConfig,
    options?: ChatOptions,
  ): Promise<LLMResponse> {
    const accessToken = getCodexAccessToken();
    const { instructions, input } = toResponsesInput(messages);

    const body: Record<string, unknown> = {
      model: config.provider.openai.model,
      instructions: instructions || 'You are a helpful assistant.',
      input,
      store: false,
      stream: true,  // Required by Codex backend
      prompt_cache_key: options?.sessionId || undefined,
    };

    if (tools.length > 0) {
      body.tools = toResponsesTools(tools);
      body.tool_choice = 'auto';
    }

    const maxRetries = config.provider.max_retries;
    let lastError: Error | null = null;
    let authRefreshed = false;
    let currentToken = accessToken;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now();

        const response = await fetch(`${CODEX_BASE_URL}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text();

          // 401 → try refreshing token once
          if (response.status === 401 && !authRefreshed) {
            authRefreshed = true;
            const { forceRefreshCodexToken } = await import('../lib/auth.js');
            try {
              currentToken = await forceRefreshCodexToken();
              continue; // retry with new token
            } catch {
              // refresh failed, fall through to error
            }
          }

          if (isRetryable(response.status) && attempt < maxRetries) {
            await sleep(Math.pow(3, attempt) * 1000);
            continue;
          }
          throw new Error(`Codex API error (${response.status}): ${errText}`);
        }

        // Parse SSE stream and collect output items
        const result = await this.consumeStream(response, startTime);
        return result;

      } catch (error) {
        lastError = error as Error;
        if (attempt === maxRetries) break;
      }
    }

    throw lastError || new Error('Codex API call failed');
  }

  /**
   * Consume SSE stream from Codex Responses API.
   *
   * Key events:
   * - response.output_item.done → completed output item (message / function_call)
   * - response.completed → final response with usage stats
   */
  private async consumeStream(response: Response, startTime: number): Promise<LLMResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      return { content: '', durationMs: Date.now() - startTime };
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const textParts: string[] = [];
    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
    let usage: LLMResponse['usage'] = undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          const eventType = event.type as string;

          // Completed output item — extract message text or function calls
          if (eventType === 'response.output_item.done') {
            const item = event.item as Record<string, unknown> | undefined;
            if (!item) continue;

            const itemType = item.type as string;

            if (itemType === 'message') {
              const content = item.content as Array<{ type: string; text?: string }> | undefined;
              if (content) {
                for (const c of content) {
                  if (c.type === 'output_text' && c.text) {
                    textParts.push(c.text);
                  }
                }
              }
            } else if (itemType === 'function_call') {
              toolCalls.push({
                id: (item.call_id as string) || '',
                name: (item.name as string) || '',
                args: JSON.parse((item.arguments as string) || '{}'),
              });
            }
          }

          // Final response — extract usage stats
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

    if (textParts.length > 0) {
      result.content = textParts.join('');
    }
    if (toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }
    if (usage) {
      result.usage = usage;
    }

    return result;
  }
}
