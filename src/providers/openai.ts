/**
 * @module providers/openai
 * @description Primary Large Language Model (LLM) provider bridging the Codex API.
 *
 * Implements a scalable fetch client connecting to the Codex reverse-proxy at
 * `chatgpt.com/backend-api/codex`. Manages session lifecycle constraints including:
 *   - Device-code OAuth token injection via Authorization headers.
 *   - Transparent Server-Sent Events (SSE) streaming response consumption.
 *   - Automatic intercept and resolution of HTTP 401 token expirations.
 *   - Exponential backoff retry logic for transient API faults.
 *
 * @see {@link ./openai/transform.ts} for message payload translation.
 * @see {@link ./openai/stream.ts} for raw SSE packet parsing.
 */

import type { Message, LLMResponse, ToolParameterSchema, LLMProvider, ChatOptions } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { getCodexAccessToken } from '../lib/auth.js';
import { classifyApiError } from '../agent/errorClassifier.js';
import { agentLogger } from '../lib/logger.js';
import { toResponsesInput, toResponsesTools } from './openai/transform.js';
import { consumeStream } from './openai/stream.js';

// ── Codex Implementation ────────────────────────────────────────────────────

/** Base endpoint for the underlying generative inference API */
const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';

/**
 * Standardized provider class orchestrating text generation, function calling,
 * and resilient network transmission against the Codex models.
 */
export class CodexProvider implements LLMProvider {
  /** The globally registered string identifier for this provider */
  readonly name = 'codex';

  /**
   * Executes a streaming chat completion request, aggregating the final response.
   *
   * @param {Message[]} messages - The sequential conversation history buffer.
   * @param {Array<{ name: string; description: string; parameters: ToolParameterSchema }>} tools - Registered JSON schemas outlining available functions.
   * @param {AnyaConfig} config - Application configuration (influences selected model).
   * @param {ChatOptions} [options] - Optional runtime metadata (e.g., semantic caching keys).
   * @returns {Promise<LLMResponse>} The aggregated structured output including text, tool invocations, and token usage metrics.
   * @throws {Error} Upon unrecoverable network failure, malformed authentication, or exhausted retry policies.
   */
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
          msg: 'api_fetch_error', provider: 'codex',
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
          msg: 'api_error', provider: 'codex',
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

/**
 * @deprecated Use {@link CodexProvider} instead. Kept for backward compatibility.
 */
export const OpenAIProvider = CodexProvider;

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

