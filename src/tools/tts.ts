/**
 * @module tools/tts
 * @description Text-to-Speech tool for the agent.
 *
 * Allows the LLM to generate speech audio from text and send it
 * as a Telegram voice message. Uses Edge TTS (free, no API key).
 *
 * Usage by the model:
 *   tts({ text: "Hello world" })                    → generate + send as voice
 *   tts({ text: "你好", voice: "zh-CN-XiaoxiaoNeural" }) → Chinese voice
 *   tts({ text: "slow read", rate: "-30%" })         → slow speech
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';
import { textToSpeech } from '../lib/tts.js';

register({
  name: 'tts',
  description: 'Generate speech audio from text using Edge TTS (free). On Telegram, sends as a voice bubble. Supports 100+ voices in 40+ languages. Use <tg-spoiler> and tts together for learning scenarios (hidden text + audio).',
  parameters: {
    type: 'object',
    properties: {
      text:   { type: 'string', description: 'Text to speak. Required.' },
      voice:  { type: 'string', description: 'Voice name. Examples: en-US-AriaNeural (default), en-US-GuyNeural, zh-CN-XiaoxiaoNeural, ja-JP-NanamiNeural.' },
      rate:   { type: 'string', description: 'Speaking rate. Examples: "+20%", "-30%".' },
    },
    required: ['text'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const text = String(args.text || '').trim();
    if (!text) {
      return JSON.stringify({ success: false, error: 'text is required' });
    }

    const result = await textToSpeech(text, context.config, {
      voice: args.voice as string | undefined,
      rate: args.rate as string | undefined,
      format: 'opus',
    });

    if (!result.success || !result.filePath) {
      return JSON.stringify({ success: false, error: result.error });
    }

    // If we have a Telegram adapter, send as voice message
    const adapter = context.adapter as any;
    if (typeof adapter.sendVoice === 'function') {
      await adapter.sendVoice(result.filePath);
      return JSON.stringify({
        success: true,
        sent: true,
        durationSec: result.durationSec,
      });
    }

    // Non-Telegram: just return the file path
    return JSON.stringify({
      success: true,
      filePath: result.filePath,
      durationSec: result.durationSec,
    });
  },
});
