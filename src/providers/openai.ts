/**
 * @module providers/openai
 * @description OpenAI LLM provider using the Codex Responses API (streaming).
 *
 * Uses the Codex API at chatgpt.com/backend-api/codex with:
 *   - OAuth device-code authentication (tokens in auth.json)
 *   - SSE streaming response consumption
 *   - Auto token refresh on 401
 *
 * Helper modules:
 *   - {@link ./openai/transform} — message ↔ Codex Responses translation
 *   - {@link ./openai/stream}    — SSE stream consumer
 */

import type { Message, LLMResponse, ToolParameterSchema, LLMProvider, ChatOptions } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { getCodexAccessToken } from '../lib/auth.js';
import { classifyApiError } from '../agent/errorClassifier.js';
import { agentLogger } from '../lib/logger.js';
import { toResponsesInput, toResponsesTools } from './openai/transform.js';
import { consumeStream } from './openai/stream.js';

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
    const maxRetries = config.provider.max_retries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();

      // 60s timeout to prevent hanging on network issues
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      let response: Response;
      try {
        response = await fetch(`${CODEX_BASE_URL}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeout);
        const isAbort = (fetchErr as Error).name === 'AbortError';
        const errMsg = isAbort
          ? 'Codex API request timed out after 60s'
          : `Codex API fetch failed: ${(fetchErr as Error).message}`;
        agentLogger.error({
          msg: 'api_fetch_error', provider: 'openai',
          error: errMsg, aborted: isAbort, attempt,
          elapsed_ms: Date.now() - startTime,
        });

        if (attempt < maxRetries) {
          await sleep(Math.min(1000 * Math.pow(2, attempt), 10_000));
          continue;
        }
        throw new Error(errMsg);
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errText = await response.text();
        const apiErr = new Error(`Codex API error (${response.status}): ${errText.substring(0, 500)}`);
        const classified = classifyApiError(apiErr);

        agentLogger.error({
          msg: 'api_error', provider: 'openai',
          status: response.status, reason: classified.reason,
          retryable: classified.retryable,
          body: errText.substring(0, 200),
          elapsed_ms: Date.now() - startTime, attempt,
        });

        // Handle 401 — refresh token and retry once
        if (classified.reason === 'auth' && !authRefreshed) {
          authRefreshed = true;
          try {
            const { forceRefreshCodexToken } = await import('../lib/auth.js');
            currentToken = await forceRefreshCodexToken();
            continue; // retry with new token
          } catch (err) {
            throw new Error(`Codex token refresh failed: ${(err as Error).message}`);
          }
        }

        if (!classified.retryable || attempt >= maxRetries) {
          throw apiErr;
        }

        await sleep(classified.backoffMs || Math.min(1000 * Math.pow(2, attempt), 10_000));
        continue;
      }

      return await consumeStream(response, startTime);
    }

    // Should not reach here, but safety net
    throw new Error('Codex API: max retries exceeded');
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
