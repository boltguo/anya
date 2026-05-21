// lib/llmSubroutine.ts — embedded LLM calls inside compound tools.
//
// Compound tools that need an LLM for the *content* step (sentence generation,
// rubric grading, error diagnosis) call this helper instead of constructing
// their own provider. The agent-loop LLM remains the orchestrator; subroutine
// LLM calls are tightly scoped: focused system prompt, single-turn, no tools,
// structured JSON output validated against a zod schema.
//
// Failures are loud — a malformed JSON response retries once, then throws.
// Compound tool callers decide whether to surface as user-visible error.

import type { ZodSchema } from 'zod';
import type { AnyaConfig } from '../config/defaults.js';
import type { Message } from '../agent/types.js';
import { createProvider } from '../providers/index.js';
import { agentLogger } from './logger.js';

export interface LlmSubroutineOptions<T> {
  config: AnyaConfig;
  // Concise task prompt (e.g. "Grade this essay on 4 IELTS bands.").
  systemPrompt: string;
  // Input data (the essay text, the audio transcript, etc).
  userPrompt: string;
  // Validates the returned JSON; failure triggers a retry then throws.
  outputSchema: ZodSchema<T>;
  // Compound tool name for log correlation.
  parentTool: string;
  sessionId?: string;
  maxRetries?: number;
}

const DEFAULT_MAX_RETRIES = 1;

const JSON_OUTPUT_HINT =
  'Return ONLY valid JSON matching the schema described above. ' +
  'No prose, no markdown fences, no commentary.';

export async function llmSubroutine<T>(opts: LlmSubroutineOptions<T>): Promise<T> {
  const provider = createProvider(opts.config);
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const startedAt = Date.now();
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const systemPrompt = `${opts.systemPrompt}\n\n${JSON_OUTPUT_HINT}`;
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ];

    try {
      // Route subroutines through the lightweight model when configured.
      // The main agent loop still uses the heavier default for routing/composition.
      const resp = await provider.chat(messages, [], opts.config, {
        sessionId: opts.sessionId,
        model: opts.config.provider.subroutine_model,
      });
      const raw = (resp.content || '').trim();
      const parsed = opts.outputSchema.parse(JSON.parse(stripFences(raw)));

      agentLogger.info({
        msg: 'llm_subroutine',
        parent: opts.parentTool,
        sessionId: opts.sessionId,
        duration_ms: Date.now() - startedAt,
        attempt,
        status: 'ok',
        tokens: resp.usage
          ? { in: resp.usage.promptTokens, out: resp.usage.completionTokens, cached: resp.usage.cachedTokens || 0 }
          : undefined,
      });

      return parsed;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        agentLogger.warn({
          msg: 'llm_subroutine',
          parent: opts.parentTool,
          sessionId: opts.sessionId,
          attempt,
          status: 'retry',
          error: lastError,
        });
        continue;
      }
    }
  }

  agentLogger.error({
    msg: 'llm_subroutine',
    parent: opts.parentTool,
    sessionId: opts.sessionId,
    duration_ms: Date.now() - startedAt,
    status: 'failed',
    error: lastError,
  });
  throw new Error(`llmSubroutine(${opts.parentTool}) failed: ${lastError}`);
}

// LLMs occasionally wrap JSON in markdown despite instructions to the contrary.
function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
}
