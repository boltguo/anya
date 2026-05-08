/**
 * @module tools/tts
 * @description Text-to-Speech tool for the agent.
 *
 * Supports two modes:
 *   1. Simple: text + voice + rate → single voice audio
 *   2. Segments: array of {voice, text, rate, break} → multi-voice SSML dialogue
 *
 * Usage by the model:
 *   tts({ text: "Hello world" })                          → simple
 *   tts({ text: "slow read", rate: "-30%" })              → slow speech
 *   tts({ segments: '[...]' })                            → multi-voice SSML dialogue
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';
import { textToSpeech } from '../lib/tts.js';

register({
  name: 'tts',
  description: `Generate speech audio via Azure TTS. Returns the file path — use tg_msg(type="voice", url=filePath) to send it.

**Simple mode**: pass \`text\` + optional \`voice\`/\`rate\`.
**Dialogue mode**: pass \`segments\` JSON array for multi-voice audio with pauses.

Segments format: [{"voice":"en-GB-RyanNeural","text":"How are you?","rate":"-5%"},{"break":"800ms"},{"voice":"en-US-AriaNeural","text":"I'm fine."}]

Each segment is either a speech segment (voice+text) or a pause (break only, e.g. "500ms", "1s").`,
  parameters: {
    type: 'object',
    properties: {
      text:     { type: 'string', description: 'Text to speak (simple mode).' },
      voice:    { type: 'string', description: 'Voice name. Examples: en-US-AriaNeural, en-GB-RyanNeural, en-GB-SoniaNeural, zh-CN-XiaoxiaoNeural.' },
      rate:     { type: 'string', description: 'Speaking rate. Examples: "+20%", "-30%".' },
      segments: { type: 'string', description: 'JSON array of segments for multi-voice dialogue. Each segment: {"voice":"...","text":"...","rate":"..."} or {"break":"500ms"}.' },
    },
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const segmentsRaw = args.segments as string | undefined;

    // ── Dialogue mode: segments array → build multi-voice SSML ──
    if (segmentsRaw) {
      let segments: Array<{ voice?: string; text?: string; rate?: string; break?: string }>;
      try {
        segments = typeof segmentsRaw === 'string' ? JSON.parse(segmentsRaw) : segmentsRaw as any;
        if (!Array.isArray(segments) || segments.length === 0) {
          return JSON.stringify({ success: false, error: 'segments must be a non-empty array' });
        }
      } catch {
        return JSON.stringify({ success: false, error: 'Invalid segments JSON' });
      }

      // Build multi-voice SSML — breaks must be inside <voice> tags for Azure
      const ssmlParts: string[] = [];
      const textParts: string[] = [];
      let pendingBreak: string | null = null;

      for (const seg of segments) {
        if (seg.break) {
          // Buffer the break — it will be prepended to the next voice segment
          pendingBreak = seg.break;
        } else if (seg.text) {
          const v = seg.voice || 'en-US-AriaNeural';
          const escaped = seg.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

          const breakTag = pendingBreak ? `<break time="${pendingBreak}"/>` : '';
          pendingBreak = null;

          if (seg.rate) {
            ssmlParts.push(`  <voice name="${v}">${breakTag}<prosody rate="${seg.rate}">${escaped}</prosody></voice>`);
          } else {
            ssmlParts.push(`  <voice name="${v}">${breakTag}${escaped}</voice>`);
          }
          textParts.push(seg.text);
        }
      }

      const fullSsml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">\n${ssmlParts.join('\n')}\n</speak>`;
      const combinedText = textParts.join(' ');

      return ttsResult(await textToSpeech(combinedText, context.config, {
        ssml: fullSsml,
        format: 'opus',
      }));
    }

    // ── Simple mode: text + voice + rate ──
    const text = String(args.text || '').trim();
    if (!text) {
      return JSON.stringify({ success: false, error: 'text or segments is required' });
    }

    return ttsResult(await textToSpeech(text, context.config, {
      voice: args.voice as string | undefined,
      rate: args.rate as string | undefined,
      format: 'opus',
    }));
  },
});

/** Format a TTS result as JSON for the LLM. */
function ttsResult(result: { success: boolean; filePath?: string; error?: string; durationSec?: number }): string {
  if (!result.success || !result.filePath) {
    return JSON.stringify({ success: false, error: result.error });
  }
  return JSON.stringify({ success: true, filePath: result.filePath, durationSec: result.durationSec });
}
