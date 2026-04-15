/**
 * @module providers/base
 * @description Abstract LLM Provider interface.
 *
 * All LLM providers (Gemini, OpenAI) must implement this contract.
 * The provider registry ({@link ./registry}) discovers providers by name
 * and the Agent calls {@link LLMProvider.chat} without knowing which
 * backend is active.
 *
 * Each provider is responsible for:
 * - Converting Anya's {@link Message} format to its native API format
 * - Handling retries and error classification
 * - Returning a normalized {@link LLMResponse} with usage metadata
 */

import type { Message, LLMResponse, ToolParameterSchema } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';

/**
 * Abstract LLM Provider interface.
 * All providers must implement this contract.
 */
export interface ChatOptions {
  /** Session ID for prompt caching (Codex uses prompt_cache_key). */
  sessionId?: string;
}

/**
 * LLM Provider interface — the contract all backends must implement.
 *
 * Designed to be stateless: each `chat()` call is independent. Provider
 * instances are singletons managed by the provider registry.
 */
export interface LLMProvider {
  /** Provider identifier (e.g., 'gemini', 'openai'). */
  readonly name: string;

  /**
   * Send a chat completion request.
   *
   * @param messages - Full conversation history (system + user + assistant + tool).
   * @param tools - Tool schemas for function calling (empty array if no tools).
   * @param config - Agent configuration (model name, temperature, API keys, etc.).
   * @param options - Optional provider-specific options (e.g., session caching).
   * @returns Normalized response with text content, tool calls, and usage stats.
   */
  chat(
    messages: Message[],
    tools: Array<{
      name: string;
      description: string;
      parameters: ToolParameterSchema;
    }>,
    config: AnyaConfig,
    options?: ChatOptions,
  ): Promise<LLMResponse>;
}
