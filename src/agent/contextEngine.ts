/**
 * @module agent/contextEngine
 * @description Abstract interface for context-window management.
 *
 * The Agent calls {@link shouldCompress} before each LLM request and
 * {@link compress} when the answer is true. Concrete implementations
 * decide *how* to shrink the history (summarisation, truncation, hybrid).
 */

import type { Message } from './types.js';

export interface ContextEngine {
  /** True when the current token count exceeds the compression threshold. */
  shouldCompress(messages: Message[], estimatedTokens: number, contextLimit: number): boolean;

  /**
   * Compress the message history to fit within the token budget.
   * Returns a shorter message array (may include a summary message).
   */
  compress(messages: Message[], contextLimit: number): Promise<Message[]>;
}
