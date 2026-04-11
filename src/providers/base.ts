import type { Message, LLMResponse, ToolParameterSchema } from '../agent/types.js';
import type { VelaConfig } from '../config/defaults.js';

/**
 * Abstract LLM Provider interface.
 * All providers must implement this contract.
 */
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
    config: VelaConfig,
  ): Promise<LLMResponse>;
}
