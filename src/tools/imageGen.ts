/**
 * @module tools/imageGen
 * @description Image generation tool using Gemini's native image generation.
 *
 * Supports two backends:
 * - **Vertex AI** (default): uses Application Default Credentials (gcloud auth).
 *   Best for users with GCP credits / billing.
 * - **AI Studio**: uses the global Gemini API key. Free tier available.
 *
 * The tool generates an image from a text prompt, saves it to the cache
 * directory, and returns the file path. On Telegram, the agent can then
 * use the `tg` tool with type=photo to send it to the user.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { register } from './registry.js';
import { IMAGE_GENERATED_DIR } from '../lib/paths.js';
import { agentLogger } from '../lib/logger.js';
import type { ToolContext } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';

/** Directory for generated images. */
const IMAGE_DIR = IMAGE_GENERATED_DIR;

/**
 * Create a GoogleGenAI client based on the configured backend.
 *
 * - Vertex AI: uses ADC (Application Default Credentials), no API key needed.
 * - AI Studio: uses the global Gemini API key from config.
 */
function createClient(config: AnyaConfig): GoogleGenAI {
  const backend = config.image_gen?.backend || 'vertex';

  if (backend === 'vertex') {
    const project = config.vertex?.project;
    const location = config.vertex?.location || 'global';

    if (!project) {
      throw new Error(
        'Vertex AI requires a GCP project ID. Set vertex.project in config.json, ' +
        'or switch to ai_studio backend in image_gen.backend.'
      );
    }

    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }

  // AI Studio backend
  const apiKey = config.provider.gemini.api_key;
  if (!apiKey) {
    throw new Error(
      'AI Studio image generation requires a Gemini API key. ' +
      'Run "anya model" to configure it.'
    );
  }

  return new GoogleGenAI({ apiKey });
}

// ── Image Generation Tool ────────────────────────────────────────────────────

register({
  name: 'image_gen',
  description: 'Generate an image from a text prompt using Gemini. Returns a local file path to the generated image. On Telegram, use the `tg` tool with type="photo" and the returned path as url to send it to the user.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Text description of the image to generate. Be specific about style, composition, colors, etc.',
      },
      aspect_ratio: {
        type: 'string',
        description: 'Aspect ratio. Options: "1:1" (square, default), "16:9" (landscape), "9:16" (portrait), "4:3", "3:4".',
      },
    },
    required: ['prompt'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const prompt = String(args.prompt || '');
    if (!prompt) return 'Error: prompt is required.';

    const config = context.config;
    const model = config.image_gen?.model || 'gemini-3.1-flash-image-preview';
    const backend = config.image_gen?.backend || 'vertex';
    const aspectRatio = String(args.aspect_ratio || config.image_gen?.aspect_ratio || '1:1');

    agentLogger.info({ msg: 'image_gen_start', backend, model, aspectRatio, promptLength: prompt.length });

    try {
      const client = createClient(config);

      // Build the prompt with aspect ratio instruction
      const fullPrompt = `${prompt}\n\nGenerate as a ${aspectRatio} aspect ratio image.`;

      // Call Gemini image generation
      const response = await client.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      });

      // Extract image data from response
      const parts = response.candidates?.[0]?.content?.parts;
      if (!parts) {
        return 'Error: No response from image generation model.';
      }

      // Find the image part (inlineData with base64)
      const imagePart = parts.find(
        (p: any) => p.inlineData
      );

      if (!imagePart || !('inlineData' in imagePart) || !imagePart.inlineData) {
        // Maybe the model returned text only (prompt was rejected?)
        const textParts = parts
          .filter((p: any) => p.text)
          .map((p: any) => p.text as string);
        if (textParts.length > 0) {
          return `Image generation failed. Model response: ${textParts.join(' ')}`;
        }
        return 'Error: Model did not return an image. Try a different prompt.';
      }

      // Save image to cache directory
      mkdirSync(IMAGE_DIR, { recursive: true });
      const imageData = (imagePart.inlineData as { data: string; mimeType: string });
      const ext = imageData.mimeType === 'image/png' ? '.png' : '.jpg';
      const filename = `gen_${randomUUID().slice(0, 8)}${ext}`;
      const filePath = join(IMAGE_DIR, filename);

      const buffer = Buffer.from(imageData.data, 'base64');
      writeFileSync(filePath, buffer);

      agentLogger.info({ msg: 'image_gen_done', filePath, sizeKB: Math.round(buffer.length / 1024) });

      // Also extract any text the model returned alongside the image
      const textParts = parts
        .filter((p: any) => p.text)
        .map((p: any) => p.text as string);
      const caption = textParts.length > 0 ? textParts.join(' ') : '';

      return JSON.stringify({
        ok: true,
        path: filePath,
        caption: caption || undefined,
        size_kb: Math.round(buffer.length / 1024),
      });
    } catch (err) {
      const error = err as Error;
      agentLogger.error({ msg: 'image_gen_error', error: error.message });
      return `Error generating image: ${error.message}`;
    }
  },
});
