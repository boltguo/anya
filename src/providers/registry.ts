/**
 * @module providers/registry
 * @description Provider registry — maps model names to LLM provider instances.
 *
 * Currently supports:
 * - `gemini` — Google AI Studio (Gemini models)
 * - `openai` — OpenAI (GPT models via Codex OAuth)
 *
 * Model name routing:
 * - `gemini-*` → GeminiProvider
 * - `gpt-*` / `o1-*` / `o3-*` → OpenAIProvider
 */

import type { LLMProvider } from './base.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';

const providers = new Map<string, LLMProvider>();

// Register built-in providers
providers.set('gemini', new GeminiProvider());
providers.set('openai', new OpenAIProvider());

/**
 * Get a provider instance by model name or provider name.
 *
 * @param name - Model name (e.g. 'gemini-3-flash-preview', 'gpt-5.4')
 *               or provider name (e.g. 'gemini', 'openai').
 * @returns The matching LLMProvider.
 * @throws Error if no provider matches the given name.
 */
export function getProvider(name: string): LLMProvider {
  // Route by model name prefix
  let providerName: string;

  if (name.startsWith('gemini')) {
    providerName = 'gemini';
  } else if (name.startsWith('gpt') || name.startsWith('o1') || name.startsWith('o3')) {
    providerName = 'openai';
  } else {
    providerName = name;
  }

  const provider = providers.get(providerName);
  if (!provider) {
    throw new Error(
      `Unknown provider for model "${name}". Available: ${[...providers.keys()].join(', ')}`
    );
  }

  return provider;
}

/**
 * Register a new provider.
 */
export function registerProvider(name: string, provider: LLMProvider): void {
  providers.set(name, provider);
}

/**
 * List all registered provider names.
 */
export function listProviders(): string[] {
  return [...providers.keys()];
}
