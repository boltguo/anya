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

export interface LLMProvider {
  readonly name: string;

  /**
   * Send a chat completion request with optional tool definitions.
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
