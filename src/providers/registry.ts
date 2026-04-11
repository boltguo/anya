import type { LLMProvider } from './base.js';
import { GeminiProvider } from './gemini.js';

const providers = new Map<string, LLMProvider>();

// Register built-in providers
providers.set('gemini', new GeminiProvider());

/**
 * Get a provider by name.
 * Currently only 'gemini' is supported.
 */
export function getProvider(name: string): LLMProvider {
  // Map model names to providers
  const providerName = name.startsWith('gemini') ? 'gemini' : name;

  const provider = providers.get(providerName);
  if (!provider) {
    throw new Error(
      `Unknown provider: ${name}. Available providers: ${[...providers.keys()].join(', ')}`
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
