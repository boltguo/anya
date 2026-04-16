/**
 * @module providers/openai
 * @description OpenAI LLM provider using the Codex Responses API (streaming).
 *
 * This is the sole LLM provider. It includes:
 *   - LLMProvider interface + ChatOptions type
 *   - OpenAIProvider implementation
 *   - getProvider() singleton accessor
 *
 * Helper modules:
 *   - {@link ./openai/transform} — message ↔ Codex Responses translation
 *   - {@link ./openai/stream}    — SSE stream consumer
 */

import pRetry, { AbortError } from 'p-retry';
import type { Message, LLMResponse, ToolParameterSchema } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { getCodexAccessToken } from '../lib/auth.js';
import { classifyApiError } from '../agent/errorClassifier.js';
import { agentLogger } from '../lib/logger.js';
import { toResponsesInput, toResponsesTools } from './openai/transform.js';
import { consumeStream } from './openai/stream.js';

// ── LLM Provider Interface ──────────────────────────────────────────────────

export interface ChatOptions {
  /** Session ID for prompt caching (Codex uses prompt_cache_key). */
  sessionId?: string;
}

export interface LLMProvider {
  readonly name: string;

  chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AnyaConfig,
    options?: ChatOptions,
  ): Promise<LLMResponse>;
}

// ── OpenAI Codex Implementation ─────────────────────────────────────────────

const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  async chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AnyaConfig,
    options?: ChatOptions,
  ): Promise<LLMResponse> {
    const { instructions, input } = toResponsesInput(messages);

    const body: Record<string, unknown> = {
      model: config.provider.model,
      instructions: instructions || 'You are a helpful assistant.',
      input,
      store: false,
      stream: true,
      prompt_cache_key: options?.sessionId || undefined,
    };

    if (tools.length > 0) {
      body.tools = toResponsesTools(tools);
      body.tool_choice = 'auto';
    }

    let currentToken = getCodexAccessToken();
    let authRefreshed = false;

    return pRetry(async () => {
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
        const apiErr = new Error(`Codex API error (${response.status}): ${errText}`);
        const classified = classifyApiError(apiErr);

        agentLogger.error({
          msg: 'api_error', provider: 'openai',
          status: response.status, reason: classified.reason,
          retryable: classified.retryable,
        });

        if (classified.reason === 'auth' && !authRefreshed) {
          authRefreshed = true;
          try {
            const { forceRefreshCodexToken } = await import('../lib/auth.js');
            currentToken = await forceRefreshCodexToken();
          } catch (err) {
            throw new AbortError(`Codex token refresh failed: ${(err as Error).message}`);
          }
          throw new Error('Codex 401 — token refreshed, retrying');
        }

        if (!classified.retryable) {
          throw new AbortError(apiErr.message);
        }
        throw apiErr;
      }

      return await consumeStream(response, startTime);
    }, {
      retries: config.provider.max_retries,
      factor: 3,
      minTimeout: 1000,
    });
  }
}

// ── Singleton Provider Accessor ─────────────────────────────────────────────

const _provider = new OpenAIProvider();

export function getProvider(): LLMProvider {
  return _provider;
}
