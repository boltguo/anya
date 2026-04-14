import { GoogleGenAI, type Content, type Part, type FunctionDeclaration, type Schema, Type } from '@google/genai';
import type { LLMProvider } from './base.js';
import type { Message, LLMResponse, ToolParameterSchema } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { agentLogger } from '../lib/logger.js';

/**
 * Convert our tool parameter schema to Gemini's Schema format.
 */
function toGeminiSchema(params: ToolParameterSchema): Schema {
  const properties: Record<string, Schema> = {};

  for (const [key, prop] of Object.entries(params.properties)) {
    const schema: Schema = {
      type: prop.type.toUpperCase() as Type,
      description: prop.description,
    };
    if (prop.enum) {
      schema.enum = prop.enum as string[];
    }
    // Gemini requires 'items' for ARRAY type properties
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
 * Determine if an error is retryable.
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('429') || message.includes('rate limit')) return true;
    if (message.includes('500') || message.includes('internal server')) return true;
    if (message.includes('502') || message.includes('bad gateway')) return true;
    if (message.includes('503') || message.includes('service unavailable')) return true;
    if (message.includes('timeout') || message.includes('timed out')) return true;
    if (message.includes('network') || message.includes('econnreset')) return true;
  }
  return false;
}

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';

  async chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AnyaConfig,
  ): Promise<LLMResponse> {
    if (!config.provider.api_key) {
      throw new Error(
        'Gemini API key not configured. Run "anya config edit" or "anya init" to set it.\n' +
        'Get a free API key at: https://aistudio.google.com/'
      );
    }

    const genai = new GoogleGenAI({ apiKey: config.provider.api_key });

    // Convert tools to Gemini function declarations
    const functionDeclarations: FunctionDeclaration[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: toGeminiSchema(t.parameters),
    }));

    const { systemInstruction, contents } = toGeminiContents(messages);

    const maxRetries = config.provider.max_retries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        agentLogger.debug({
          msg: 'api_call',
          model: config.provider.primary,
          attempt,
          messageCount: contents.length,
          toolCount: functionDeclarations.length,
        });

        const startTime = Date.now();

        const response = await genai.models.generateContent({
          model: config.provider.primary,
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

        const durationMs = Date.now() - startTime;

        agentLogger.info({
          msg: 'api_response',
          model: config.provider.primary,
          duration_ms: durationMs,
        });

        // Parse the response
        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) {
          return { content: '' };
        }

        const rawParts = candidate.content.parts;
        const result: LLMResponse = {
          // Preserve raw parts for round-tripping (thought_signature etc)
          rawModelParts: rawParts,
        };

        // Extract text content
        const textParts = rawParts
          .filter(p => 'text' in p && p.text)
          .map(p => (p as { text: string }).text);

        if (textParts.length > 0) {
          result.content = textParts.join('');
        }

        // Extract function calls
        const fnCalls = rawParts
          .filter(p => 'functionCall' in p && p.functionCall);

        if (fnCalls.length > 0) {
          result.toolCalls = fnCalls.map((p, i) => {
            const fc = (p as { functionCall: { name: string; args: Record<string, unknown> } }).functionCall;
            return {
              id: `call_${Date.now()}_${i}`,
              name: fc.name,
              args: fc.args || {},
            };
          });
        }

        // Extract usage if available
        if (response.usageMetadata) {
          const meta = response.usageMetadata as Record<string, number>;
          result.usage = {
            promptTokens: meta.promptTokenCount || 0,
            completionTokens: meta.candidatesTokenCount || 0,
            totalTokens: meta.totalTokenCount || 0,
            cachedTokens: meta.cachedContentTokenCount || 0,
            thoughtsTokens: meta.thoughtsTokenCount || 0,
          };
        }

        return result;

      } catch (error) {
        lastError = error as Error;

        if (!isRetryable(error) || attempt === maxRetries) {
          agentLogger.error({
            msg: 'api_error',
            provider: 'gemini',
            attempt,
            error: (error as Error).message,
          });
          break;
        }

        // Exponential backoff: 1s, 3s, 9s
        const backoff = Math.pow(3, attempt) * 1000;
        agentLogger.warn({
          msg: 'api_retry',
          provider: 'gemini',
          attempt: attempt + 1,
          backoff_ms: backoff,
        });

        await sleep(backoff);
      }
    }

    throw lastError || new Error('Gemini API call failed');
  }
}
