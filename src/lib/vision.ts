// lib/vision.ts — Gemini image analysis

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AnyaConfig } from '../config/defaults.js';
import { agentLogger } from './logger.js';
import { trackVision } from './usage.js';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp',
};

export interface VisionResult {
  success: boolean;
  description?: string;
  error?: string;
}

export async function analyzeImage(
  imagePath: string,
  config: AnyaConfig,
  userCaption?: string,
): Promise<VisionResult> {
  const apiKey = config.gemini?.api_key;
  if (!apiKey) {
    return { success: false, error: 'Gemini API key not configured. Run `anya config` → Gemini.' };
  }

  if (!fs.existsSync(imagePath)) {
    return { success: false, error: `Image file not found: ${imagePath}` };
  }

  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = MIME_MAP[ext];
  if (!mimeType) return { success: false, error: `Unsupported format: ${ext}` };

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Data = imageBuffer.toString('base64');
  const sizeMB = imageBuffer.length / (1024 * 1024);
  if (sizeMB > 20) return { success: false, error: `Image too large: ${sizeMB.toFixed(1)}MB (max 20MB)` };

  const model = config.gemini.vision_model || 'gemini-3-flash-preview';
  const prompt = userCaption
    ? `Describe this image in detail, then answer the user's question: "${userCaption}". Include any text, code, data, objects, layout, and notable visual information. Reply in the same language as the user's question.`
    : 'Describe everything visible in this image in thorough detail. Include any text, code, data, objects, people, layout, colors, and any other notable visual information. Reply in Chinese if the image contains Chinese text, otherwise reply in the same language as any text in the image.';

  try {
    agentLogger.info({ msg: 'vision_analyze', imagePath, model, sizeMB: sizeMB.toFixed(1) });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } },
        ]}],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Gemini API ${res.status}: ${errText}` };
    }

    const data = await res.json() as any;
    const description = data.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text).map((p: any) => p.text).join('');

    trackVision();

    if (!description) return { success: false, error: 'Gemini returned empty response' };

    agentLogger.info({ msg: 'vision_done', descLength: description.length });
    return { success: true, description };
  } catch (err) {
    const error = err as Error;
    agentLogger.error({ msg: 'vision_error', error: error.message });
    return { success: false, error: `Vision analysis failed: ${error.message}` };
  }
}
