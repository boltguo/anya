/**
 * @module tools/imageGen
 * @description Image generation via Gemini REST API.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { register } from './registry.js';
import { IMAGE_GENERATED_DIR } from '../lib/paths.js';
import { trackImageGen } from '../lib/usage.js';
import { agentLogger } from '../lib/logger.js';
import type { ToolContext } from '../agent/types.js';

register({
  name: 'image_gen',
  description: 'Generate an image from a text prompt using Gemini. Returns a local file path. On Telegram, use `tg` with type="photo" and the path as url.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Text description of the image to generate.' },
      aspect_ratio: { type: 'string', description: 'Aspect ratio: "1:1", "16:9", "9:16", "4:3", "3:4".' },
    },
    required: ['prompt'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const prompt = String(args.prompt || '');
    if (!prompt) return 'Error: prompt is required.';

    const config = context.config;
    const apiKey = config.gemini?.api_key;
    if (!apiKey) return 'Error: Gemini API key not configured. Run "anya config" → Gemini.';

    const model = config.gemini.image_model;
    const aspectRatio = String(args.aspect_ratio || config.gemini.aspect_ratio || '1:1');

    agentLogger.info({ msg: 'image_gen_start', model, aspectRatio, promptLength: prompt.length });

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const fullPrompt = `${prompt}\n\nGenerate as a ${aspectRatio} aspect ratio image.`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return `Error: Gemini API ${res.status}: ${errText}`;
      }

      const data = await res.json() as any;
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts) return 'Error: No response from image generation model.';

      const imagePart = parts.find((p: any) => p.inlineData);
      if (!imagePart?.inlineData) {
        const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
        return textParts.length > 0
          ? `Image generation failed. Model response: ${textParts.join(' ')}`
          : 'Error: Model did not return an image. Try a different prompt.';
      }

      mkdirSync(IMAGE_GENERATED_DIR, { recursive: true });
      const { data: imgData, mimeType } = imagePart.inlineData;
      const ext = mimeType === 'image/png' ? '.png' : '.jpg';
      const filePath = join(IMAGE_GENERATED_DIR, `gen_${randomUUID().slice(0, 8)}${ext}`);

      const buffer = Buffer.from(imgData, 'base64');
      writeFileSync(filePath, buffer);

      agentLogger.info({ msg: 'image_gen_done', filePath, sizeKB: Math.round(buffer.length / 1024) });
      trackImageGen();

      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
      return JSON.stringify({
        ok: true,
        path: filePath,
        caption: textParts.length > 0 ? textParts.join(' ') : undefined,
        size_kb: Math.round(buffer.length / 1024),
      });
    } catch (err) {
      const error = err as Error;
      agentLogger.error({ msg: 'image_gen_error', error: error.message });
      return `Error generating image: ${error.message}`;
    }
  },
});
