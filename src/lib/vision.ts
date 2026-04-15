/**
 * @module lib/vision
 * @description Image analysis via Gemini SDK.
 *
 * Used for one-off image understanding (Telegram photo messages).
 * The result is a text description injected into the conversation —
 * the base64 image data never enters the chat history.
 *
 * Now uses the same `@google/genai` SDK and credential pool as the
 * main Gemini provider, eliminating the old raw `fetch` + query-string
 * API key pattern.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import type { AnyaConfig } from '../config/defaults.js';
import { getCredentialPool } from '../providers/credentialPool.js';
import { agentLogger } from './logger.js';

// Supported image MIME types
const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

export interface VisionResult {
  success: boolean;
  description?: string;
  error?: string;
}

/**
 * Resolve the Gemini API key for vision tasks.
 *
 * Uses the global Gemini API key from provider config or credential pool.
 */
function resolveApiKey(config: AnyaConfig): string | undefined {
  // Credential pool (shares keys with the main provider)
  const pool = getCredentialPool();
  const allKeys = config.provider.gemini.api_keys?.length
    ? config.provider.gemini.api_keys
    : config.provider.gemini.api_key ? [config.provider.gemini.api_key] : [];

  for (const key of allKeys) {
    pool.register('gemini', key);
  }

  const cred = pool.current('gemini');
  if (cred) return cred.apiKey;

  // Env var fallback
  return process.env.GEMINI_API_KEY || undefined;
}

/**
 * Analyze an image file and return a text description.
 *
 * Uses Gemini Flash via the official SDK for fast, cheap image understanding.
 * The image is read, converted to base64, sent in a one-off API call,
 * and the description is returned as plain text.
 */
export async function analyzeImage(
  imagePath: string,
  config: AnyaConfig,
  userCaption?: string,
): Promise<VisionResult> {
  const apiKey = resolveApiKey(config);
  if (!apiKey) {
    return {
      success: false,
      error: '未配置 Gemini API Key，无法分析图片。运行 anya config 配置 Vision。',
    };
  }

  // Validate file exists
  if (!fs.existsSync(imagePath)) {
    return { success: false, error: `Image file not found: ${imagePath}` };
  }

  // Detect MIME type
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = MIME_MAP[ext];
  if (!mimeType) {
    return { success: false, error: `Unsupported image format: ${ext}` };
  }

  // Read and encode to base64
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Data = imageBuffer.toString('base64');

  // Check size (Gemini limit: ~20MB for inline data)
  const sizeMB = imageBuffer.length / (1024 * 1024);
  if (sizeMB > 20) {
    return { success: false, error: `Image too large: ${sizeMB.toFixed(1)}MB (max 20MB)` };
  }

  const model = config.vision?.model || 'gemini-3-flash-preview';

  // Build prompt
  const prompt = userCaption
    ? `Describe this image in detail, then answer the user's question: "${userCaption}". Include any text, code, data, objects, layout, and notable visual information. Reply in the same language as the user's question.`
    : 'Describe everything visible in this image in thorough detail. Include any text, code, data, objects, people, layout, colors, and any other notable visual information. Reply in Chinese if the image contains Chinese text, otherwise reply in the same language as any text in the image.';

  try {
    agentLogger.info({ msg: 'vision_analyze', model, sizeMB: sizeMB.toFixed(1) });

    const genai = new GoogleGenAI({ apiKey });
    const response = await genai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
        ],
      }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 2000,
      },
    });

    const description = response.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text)
      .map((p: any) => p.text as string)
      .join('');

    if (!description) {
      return { success: false, error: 'Gemini returned empty response' };
    }

    agentLogger.info({ msg: 'vision_done', descLength: description.length });

    return { success: true, description };
  } catch (err) {
    const error = err as Error;
    agentLogger.error({ msg: 'vision_error', error: error.message });
    return { success: false, error: `Vision analysis failed: ${error.message}` };
  }
}
