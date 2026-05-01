/**
 * @module providers/gemini
 * @description Gemini LLM provider using the Google AI Studio REST API.
 *
 * This is the sole LLM provider. It includes:
 *   - LLMProvider interface + ChatOptions type
 *   - GeminiProvider implementation
 *   - getProvider() singleton accessor
 *   - Message[] → Gemini contents format conversion
 *
 * Uses the non-streaming `generateContent` endpoint for simplicity.
 * Retries are handled internally with exponential backoff.
 */

import type { Message, LLMResponse, ToolParameterSchema } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { classifyApiError } from '../agent/errorClassifier.js';
import { agentLogger } from '../lib/logger.js';
import { promises as fs } from 'node:fs';

// ── LLM Provider Interface ──────────────────────────────────────────────────

export interface ChatOptions {
  /** Session ID for prompt caching. */
  sessionId?: string;
}

export interface LLMProvider {
  readonly name: string;

  chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AnyaConfig,
    options?: ChatOptions,
  ): Promise<LLMResponse>;
}

// ── Gemini Types ────────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown>; thought_signature?: string };
  functionResponse?: { name: string; response: { result: string } };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// ── Message Transformation ──────────────────────────────────────────────────

/**
 * Convert our Message[] to Gemini API format.
 *
 * Key mappings:
 *   - system → systemInstruction (extracted separately)
 *   - user → role: 'user' with text part
 *   - assistant → role: 'model' with text + functionCall parts
 *   - tool → role: 'user' with functionResponse part
 *
 * Gemini requires strict alternating user/model turns,
 * so consecutive same-role messages are merged into a single turn.
 */
async function toGeminiFormat(messages: Message[]): Promise<{
  systemInstruction: string;
  contents: GeminiContent[];
}> {
  let systemInstruction = '';
  const rawContents: GeminiContent[] = [];

  // Build a name lookup for tool calls so we can pair tool results
  // with their function names (Gemini requires name, not just ID).
  const toolCallNameMap = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = msg.content || '';
      continue;
    }

    if (msg.role === 'user') {
      const parts: GeminiPart[] = [{ text: msg.content || '' }];

      // Native multimodal: attach images as inlineData
      if (msg.files && msg.files.length > 0) {
        for (const file of msg.files) {
          try {
            const buffer = await fs.readFile(file.path);
            const data = buffer.toString('base64');
            parts.push({ inlineData: { mimeType: file.mimeType, data } });
          } catch {
            agentLogger.warn({ msg: 'inline_data_read_error', path: file.path });
          }
        }
      }

      rawContents.push({ role: 'user', parts });
      continue;
    }

    if (msg.role === 'assistant') {
      // If we have raw parts from the model, use them directly.
      // This preserves thought_signature and other opaque fields natively.
      if (msg._rawParts && msg._rawParts.length > 0) {
        rawContents.push({ role: 'model', parts: msg._rawParts as GeminiPart[] });
        // Still populate toolCallNameMap so subsequent tool results can resolve names
        for (const part of msg._rawParts as GeminiPart[]) {
          if (part.functionCall) {
            toolCallNameMap.set(part.functionCall.name, part.functionCall.name);
          }
        }
        continue;
      }

      // Fallback: reconstruct from our parsed data
      const parts: GeminiPart[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          toolCallNameMap.set(tc.id, tc.name);
          const functionCall: { name: string; args: Record<string, unknown>; thought_signature?: string } = {
            name: tc.name,
            args: tc.args,
          };
          // Always provide the official validator bypass value if we don't have the original signature
          functionCall.thought_signature = tc.thoughtSignature || 'skip_thought_signature_validator';
          parts.push({ functionCall });
        }
      }

      if (parts.length === 0) {
        parts.push({ text: '' });
      }

      rawContents.push({ role: 'model', parts });
      continue;
    }

    if (msg.role === 'tool') {
      const toolName = msg.toolName || toolCallNameMap.get(msg.toolCallId || '') || 'unknown';
      rawContents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: toolName,
            response: { result: msg.content || '' },
          },
        }],
      });
      continue;
    }
  }

  // Merge consecutive same-role messages (Gemini requires alternating turns)
  const contents: GeminiContent[] = [];
  for (const item of rawContents) {
    const last = contents[contents.length - 1];
    if (last && last.role === item.role) {
      last.parts.push(...item.parts);
    } else {
      contents.push({ ...item, parts: [...item.parts] });
    }
  }

  return { systemInstruction, contents };
}


// ── Gemini Provider Implementation ──────────────────────────────────────────

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';

  async chat(
    messages: Message[],
    tools: Array<{ name: string; description: string; parameters: ToolParameterSchema }>,
    config: AnyaConfig,
    _options?: ChatOptions,
  ): Promise<LLMResponse> {
    const apiKey = config.gemini.api_key;
    if (!apiKey) {
      throw new Error('Gemini API key not configured. Run "anya config" → Gemini to set it.');
    }

    const model = config.provider.model;
    const { systemInstruction, contents } = await toGeminiFormat(messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: config.provider.temperature,
        maxOutputTokens: config.provider.max_tokens,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (tools.length > 0) {
      body.tools = [{
        functionDeclarations: tools,
      }];
      body.toolConfig = {
        functionCallingConfig: { mode: 'AUTO' },
      };
    }

    const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;
    const maxRetries = config.provider.max_retries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();

      // 60s timeout to prevent hanging on network issues
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeout);
        const isAbort = (fetchErr as Error).name === 'AbortError';
        const errMsg = isAbort
          ? 'Gemini API request timed out after 60s'
          : `Gemini API fetch failed: ${(fetchErr as Error).message}`;
        agentLogger.error({
          msg: 'api_fetch_error', provider: 'gemini',
          error: errMsg, aborted: isAbort, attempt,
          elapsed_ms: Date.now() - startTime,
        });

        if (attempt < maxRetries) {
          await sleep(Math.min(1000 * Math.pow(2, attempt), 10_000));
          continue;
        }
        throw new Error(errMsg);
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errText = await response.text();
        const apiErr = new Error(`Gemini API error (${response.status}): ${errText.substring(0, 500)}`);
        const classified = classifyApiError(apiErr);

        agentLogger.error({
          msg: 'api_error', provider: 'gemini',
          status: response.status, reason: classified.reason,
          retryable: classified.retryable,
          body: errText.substring(0, 200),
          elapsed_ms: Date.now() - startTime, attempt,
        });

        if (!classified.retryable || attempt >= maxRetries) {
          throw apiErr;
        }

        await sleep(classified.backoffMs || Math.min(1000 * Math.pow(2, attempt), 10_000));
        continue;
      }

      // ── Parse successful response ──
      const data = await response.json() as Record<string, unknown>;
      const durationMs = Date.now() - startTime;

      return parseGeminiResponse(data, durationMs);
    }

    // Should not reach here, but safety net
    throw new Error('Gemini API: max retries exceeded');
  }
}

// ── Response Parsing ────────────────────────────────────────────────────────

function parseGeminiResponse(data: Record<string, unknown>, durationMs: number): LLMResponse {
  const result: LLMResponse = { durationMs };

  // Extract usage metadata
  const usageMeta = data.usageMetadata as Record<string, unknown> | undefined;
  if (usageMeta) {
    result.usage = {
      promptTokens: (usageMeta.promptTokenCount as number) || 0,
      completionTokens: (usageMeta.candidatesTokenCount as number) || 0,
      totalTokens: (usageMeta.totalTokenCount as number) || 0,
      cachedTokens: (usageMeta.cachedContentTokenCount as number) || 0,
    };
  }

  // Extract candidate content
  const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
  if (!candidates || candidates.length === 0) {
    return result;
  }

  const candidate = candidates[0];
  const content = candidate.content as { parts?: GeminiPart[] } | undefined;
  if (!content?.parts) {
    return result;
  }

  const rawParts = content.parts;
  result.rawModelParts = rawParts;

  const textParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown>; thoughtSignature?: string }> = [];

  for (const part of content.parts) {
    if (part.text) {
      textParts.push(part.text);
    }
    if (part.functionCall) {
      toolCalls.push({
        id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        name: part.functionCall.name,
        args: part.functionCall.args || {},
        thoughtSignature: part.functionCall.thought_signature,
      });
    }
  }

  if (textParts.length > 0) {
    result.content = textParts.join('');
  }
  if (toolCalls.length > 0) {
    result.toolCalls = toolCalls;
  }

  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Singleton Provider Accessor ─────────────────────────────────────────────

const _provider = new GeminiProvider();

export function getProvider(): LLMProvider {
  return _provider;
}
