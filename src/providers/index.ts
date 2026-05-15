/**
 * @module providers/index
 * @description Provider factory. Currently OpenAI/Codex only.
 */

import type { LLMProvider } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { CodexProvider } from './openai.js';

export function createProvider(_config: AnyaConfig): LLMProvider {
  return new CodexProvider();
}
