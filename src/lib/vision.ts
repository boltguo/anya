/**
 * @module lib/vision
 * @description Image analysis via Gemini Flash API.
 *
 * Used for one-off image understanding (Telegram photo messages).
 * The result is a text description injected into the conversation —
 * the base64 image data never enters the chat history.
 *
 * API key resolution:
 *   1. config.vision.gemini_api_key (dedicated vision key)
 *   2. config.provider.gemini.api_key (main Gemini key)
 *   3. GEMINI_API_KEY env var
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AnyaConfig } from '../config/defaults.js';
import { agentLogger } from './logger.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

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
 * Priority: vision-specific key → main Gemini key → env var
 */
function resolveApiKey(config: AnyaConfig): string | undefined {
  return config.vision?.gemini_api_key
    || config.provider?.gemini?.api_key
    || process.env.GEMINI_API_KEY
    || undefined;
}

/**
 * Analyze an image file and return a text description.
 *
 * Uses Gemini Flash for fast, cheap image understanding.
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

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64Data,
          },
        },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2000,
    },
  };

  const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;

  try {
    agentLogger.info({ msg: 'vision_analyze', model, sizeMB: sizeMB.toFixed(1) });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      agentLogger.error({ msg: 'vision_error', status: response.status, error: errorText.substring(0, 200) });
      return { success: false, error: `Gemini API error: ${response.status}` };
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const description = data.candidates?.[0]?.content?.parts?.[0]?.text;

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
