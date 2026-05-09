/**
 * @module providers/index
 * @description Provider factory for creating the appropriate LLM provider
 * based on the active configuration backend setting.
 */

import type { LLMProvider } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { CodexProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';

/**
 * Creates an LLM provider instance based on the configured backend.
 *
 * @param config - The active application configuration.
 * @returns An LLMProvider implementation matching the configured backend.
 */
export function createProvider(config: AnyaConfig): LLMProvider {
  switch (config.provider.backend) {
    case 'codex':
      return new CodexProvider();
    case 'gemini':
      return new GeminiProvider();
    default:
      // Fallback to gemini for unrecognized values
      return new GeminiProvider();
  }
}
