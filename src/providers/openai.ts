/**
 * @module providers/openai
 * @description OpenAI LLM provider using the Codex Responses API (streaming).
 *
 * Implementation split across sibling modules:
 *   - {@link ./openai/transform} — message ↔ Codex Responses translation
 *   - {@link ./openai/stream}    — SSE stream consumer
 *   - {@link ./openai/retry}     — retry classification
 */

import pRetry, { AbortError } from 'p-retry';
import type { LLMProvider, ChatOptions } from './base.js';
import type { Message, LLMResponse, ToolParameterSchema } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { getCodexAccessToken } from '../lib/auth.js';
import { classifyApiError } from '../agent/errorClassifier.js';
import { agentLogger } from '../lib/logger.js';
import { toResponsesInput, toResponsesTools } from './openai/transform.js';
import { consumeStream } from './openai/stream.js';

/** Codex API base URL (ChatGPT backend, not the public OpenAI API). */
const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';

/**
 * OpenAIProvider — LLM provider backed by the Codex Responses API.
 *
 * Uses streaming SSE responses and OAuth-based authentication
 * (device code flow via {@link ../lib/auth}).
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';

  /**
   * Send a streaming chat completion request to the Codex API.
   *
   * @param messages - Conversation history.
   * @param tools - Tool schemas for function calling.
   * @param config - Agent configuration.
   * @param options - Optional session ID for prompt caching.
   */
  async chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AnyaConfig,
    options?: ChatOptions,
  ): Promise<LLMResponse> {
    // Convert Anya's Message[] to the Codex Responses API input format
    const { instructions, input } = toResponsesInput(messages);

    const body: Record<string, unknown> = {
      model: config.provider.openai.model,
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

    // Get current OAuth access token for the Codex API
    let currentToken = getCodexAccessToken();
    let authRefreshed = false;  // Only attempt one token refresh per call

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

        // Auth errors: attempt one token refresh before giving up
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

      // Consume the SSE stream and parse it into a normalized LLMResponse
      return await consumeStream(response, startTime);
    }, {
      retries: config.provider.max_retries,
      factor: 3,
      minTimeout: 1000,
    });
  }
}
