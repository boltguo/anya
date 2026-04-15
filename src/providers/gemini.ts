/**
 * @module providers/gemini
 * @description Google Gemini LLM provider.
 *
 * Implements the {@link LLMProvider} interface using the official `@google/genai` SDK.
 *
 * Key responsibilities:
 * - Convert Anya's internal {@link Message} format to Gemini's `Content[]`
 * - Convert Anya's tool schemas to Gemini's `FunctionDeclaration[]`
 * - Handle multi-key credential rotation via {@link CredentialPool}
 * - Retry transient errors with exponential backoff via `p-retry`
 * - Preserve raw model parts (e.g. `thought_signature`) for multi-turn fidelity
 */

import { GoogleGenAI, type Content, type Part, type FunctionDeclaration, type Schema, Type } from '@google/genai';
import pRetry, { AbortError } from 'p-retry';
import { randomUUID } from 'node:crypto';
import type { LLMProvider } from './base.js';
import type { Message, LLMResponse, ToolParameterSchema } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { classifyApiError } from '../agent/errorClassifier.js';
import { getCredentialPool } from './credentialPool.js';
import { agentLogger } from '../lib/logger.js';

/**
 * Convert Anya's tool parameter schema to Gemini's Schema format.
 *
 * Gemini requires uppercase type names (STRING, NUMBER, OBJECT, etc.)
 * and a specific `items` structure for ARRAY types.
 */
function toGeminiSchema(params: ToolParameterSchema): Schema {
  const properties: Record<string, Schema> = {};

  for (const [key, prop] of Object.entries(params.properties)) {
    const schema: Schema = {
      type: prop.type.toUpperCase() as Type,  // Gemini uses uppercase type enums
      description: prop.description,
    };
    if (prop.enum) {
      schema.enum = prop.enum as string[];
    }
    // Gemini requires explicit 'items' for ARRAY type properties
    if (prop.type === 'array' && prop.items) {
      schema.items = { type: prop.items.type.toUpperCase() as Type };
    }
    properties[key] = schema;
  }

  return {
    type: Type.OBJECT,
    properties,
    required: params.required,
  };
}

/**
 * Convert our Message format to Gemini's Content format.
 *
 * For assistant messages that have _rawParts (from a previous Gemini response),
 * we use those raw parts directly to preserve thought_signature and other
 * opaque fields the API requires for multi-turn function calling.
 */
function toGeminiContents(messages: Message[]): { systemInstruction?: string; contents: Content[] } {
  let systemInstruction: string | undefined;
  const contents: Content[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = msg.content;
      continue;
    }

    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content || '' }],
      });
    } else if (msg.role === 'assistant') {
      // If we have raw parts from the model, use them directly.
      // This preserves thought_signature and other opaque fields.
      if (msg._rawParts && msg._rawParts.length > 0) {
        contents.push({ role: 'model', parts: msg._rawParts as Part[] });
      } else {
        // Fallback: reconstruct from our parsed data (e.g. loaded from DB)
        const parts: Part[] = [];

        if (msg.content) {
          parts.push({ text: msg.content });
        }

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.args,
              },
            });
          }
        }

        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
      }
    } else if (msg.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.toolName || 'unknown',
            response: { result: msg.content || '' },
          },
        }],
      });
    }
  }

  return { systemInstruction, contents };
}

/**
 * GeminiProvider — LLM provider backed by Google's Gemini API.
 *
 * Uses the `@google/genai` SDK with credential pooling and automatic
 * retry. Supports function calling (tool use) and multi-turn conversations.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';

  /**
   * Send a chat completion request to the Gemini API.
   *
   * @param messages - Conversation history in Anya's internal format.
   * @param tools - Tool schemas to expose as Gemini function declarations.
   * @param config - Agent configuration (model name, temperature, etc.).
   * @returns Parsed LLM response with content, tool calls, and usage metadata.
   */
  async chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AnyaConfig,
  ): Promise<LLMResponse> {
    // ── Credential Setup ──────────────────────────────────────────────
    // Register all configured keys into the pool (idempotent).
    // Supports both single `api_key` and multi-key `api_keys[]` configs.
    const pool = getCredentialPool();
    const allKeys = config.provider.gemini.api_keys?.length
      ? config.provider.gemini.api_keys
      : config.provider.gemini.api_key ? [config.provider.gemini.api_key] : [];

    if (allKeys.length === 0) {
      throw new Error(
        'Gemini API key not configured. Run "anya model" or "anya init" to set it.\n' +
        'Get a free API key at: https://aistudio.google.com/'
      );
    }

    for (const key of allKeys) {
      pool.register('gemini', key);
    }

    const cred = pool.current('gemini');
    if (!cred) {
      throw new Error('All Gemini API keys are in cooldown. Try again later.');
    }

    // ── Build Request ─────────────────────────────────────────────────
    const genai = new GoogleGenAI({ apiKey: cred.apiKey });

    // Convert Anya's tool schemas to Gemini's FunctionDeclaration format
    const functionDeclarations: FunctionDeclaration[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: toGeminiSchema(t.parameters),
    }));

    // Convert Anya's Message[] to Gemini's Content[] (+ extract system instruction)
    const { systemInstruction, contents } = toGeminiContents(messages);

    // ── API Call with Retry ───────────────────────────────────────────
    // p-retry handles transient errors; AbortError skips retries for
    // permanent failures (auth, billing). Credential rotation happens
    // inside the retry loop on shouldRotate errors.
    return pRetry(async () => {
      const startTime = Date.now();

      agentLogger.debug({
        msg: 'api_call',
        model: config.provider.gemini.model,
        messageCount: contents.length,
        toolCount: functionDeclarations.length,
      });

      let response;
      try {
        response = await genai.models.generateContent({
          model: config.provider.gemini.model,
          contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: config.provider.temperature,
            maxOutputTokens: config.provider.max_tokens,
            tools: functionDeclarations.length > 0
              ? [{ functionDeclarations }]
              : undefined,
          },
        });
      } catch (err) {
        const classified = classifyApiError(err);
        agentLogger.error({
          msg: 'api_error', provider: 'gemini',
          reason: classified.reason, retryable: classified.retryable,
          error: classified.original.message,
        });
        if (classified.shouldRotate && pool.size('gemini') > 1) {
          pool.rotate('gemini', classified.reason);
        }
        if (!classified.retryable) {
          throw new AbortError(classified.original.message);
        }
        throw err;
      }

      // ── Parse Response ────────────────────────────────────────────
      const durationMs = Date.now() - startTime;

      const candidate = response.candidates?.[0];
      if (!candidate?.content?.parts) {
        return { content: '' };  // Empty response (safety filter, etc.)
      }

      // Preserve raw model parts for round-tripping in multi-turn calls.
      // Gemini fields like `thought_signature` must be echoed back verbatim.
      const rawParts = candidate.content.parts;
      const result: LLMResponse = {
        rawModelParts: rawParts,
        durationMs,
      };

      // Extract text parts from the response
      const textParts = rawParts
        .filter(p => 'text' in p && p.text)
        .map(p => (p as { text: string }).text);

      if (textParts.length > 0) {
        result.content = textParts.join('');
      }

      // Extract function calls (tool use requests from the model)
      const fnCalls = rawParts.filter(p => 'functionCall' in p && p.functionCall);

      if (fnCalls.length > 0) {
        result.toolCalls = fnCalls.map((p) => {
          const fc = (p as { functionCall: { name: string; args: Record<string, unknown> } }).functionCall;
          return {
            id: `call_${randomUUID()}`,  // Generate unique ID for tool result correlation
            name: fc.name,
            args: fc.args || {},
          };
        });
      }

      // Extract token usage from Gemini's metadata format
      if (response.usageMetadata) {
        const meta = response.usageMetadata as Record<string, number>;
        result.usage = {
          promptTokens: meta.promptTokenCount || 0,
          completionTokens: meta.candidatesTokenCount || 0,
          totalTokens: meta.totalTokenCount || 0,
          cachedTokens: meta.cachedContentTokenCount || 0,      // Implicit context cache
          thoughtsTokens: meta.thoughtsTokenCount || 0,          // Gemini 2.5+ thinking tokens
        };
      }

      return result;
    }, {
      retries: config.provider.max_retries,
      factor: 3,
      minTimeout: 1000,
      onFailedAttempt: (err) => {
        agentLogger.warn({
          msg: 'api_retry',
          provider: 'gemini',
          attempt: err.attemptNumber,
          retriesLeft: err.retriesLeft,
          error: (err as unknown as Error).message,
        });
      },
    });
  }
}
