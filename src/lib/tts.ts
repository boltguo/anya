/**
 * @module lib/tts
 * @description Text-to-Speech service using Azure Cognitive Services REST API.
 *
 * Features:
 *   - Azure Neural voices (100+ voices, 40+ languages)
 *   - Full SSML: <phoneme>, <emphasis>, <break>, <lang>, prosody
 *   - Direct OGG Opus output for Telegram (no ffmpeg needed)
 *
 * Configuration: config.tts { voice, rate }, config.azure { speech_key, speech_region }
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TTS_DIR } from './paths.js';
import { agentLogger } from './logger.js';
import { trackTts, countBillableChars } from './usage.js';
import type { AnyaConfig } from '../config/defaults.js';

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_VOICE = 'en-US-AriaNeural';
const DEFAULT_RATE = '+0%';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TtsOptions {
  /** Voice name (e.g. "en-US-AriaNeural", "zh-CN-XiaoxiaoNeural") */
  voice?: string;
  /** Speaking rate (e.g. "+20%", "-10%") */
  rate?: string;
  /** Output format: 'opus' for Telegram voice, 'mp3' for general */
  format?: 'opus' | 'mp3';
  /** Raw SSML body. If provided, text/voice/rate are ignored. */
  ssml?: string;
}

export interface TtsResult {
  success: boolean;
  filePath?: string;
  error?: string;
  /** Duration in seconds (approximate, from file size) */
  durationSec?: number;
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Generate speech audio from text via Azure TTS REST API.
 */
export async function textToSpeech(
  text: string,
  config: AnyaConfig,
  opts?: TtsOptions,
): Promise<TtsResult> {
  if (!text?.trim() && !opts?.ssml) {
    return { success: false, error: 'Text is required' };
  }

  if (!config.azure?.speech_key) {
    return { success: false, error: 'Azure Speech key not configured' };
  }

  const speechKey = config.azure.speech_key;
  const speechRegion = config.azure.speech_region || 'eastasia';
  const ttsConfig = config.tts ?? {};
  const voice = opts?.voice || ttsConfig.voice || DEFAULT_VOICE;
  const rate = opts?.rate || ttsConfig.rate || DEFAULT_RATE;
  const wantOpus = opts?.format === 'opus';

  const maxLen = 8000;
  if (text.length > maxLen) text = text.substring(0, maxLen);

  // Use SSML only when needed (custom rate or explicit ssml), otherwise plain text
  const needsSsml = !!opts?.ssml || (rate !== DEFAULT_RATE && rate !== '0%');
  const body = opts?.ssml || (needsSsml ? buildSsml(text, voice, rate) : text);
  const contentType = needsSsml ? 'application/ssml+xml' : 'text/plain';

  const timestamp = Date.now();
  const outputFormat = wantOpus ? 'ogg-48khz-16bit-mono-opus' : 'audio-24khz-96kbitrate-mono-mp3';
  const ext = wantOpus ? '.ogg' : '.mp3';
  const outputPath = path.join(TTS_DIR, `tts_${timestamp}${ext}`);

  fs.mkdirSync(TTS_DIR, { recursive: true });

  try {
    agentLogger.info({ msg: 'tts_start', voice, rate, format: wantOpus ? 'opus' : 'mp3', ssml: needsSsml, textLen: text.length });

    const url = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': contentType,
      'X-Microsoft-OutputFormat': outputFormat,
      'User-Agent': 'Anya-TTS',
    };
    // Plain text mode needs voice specified via header
    if (!needsSsml) {
      headers['X-Microsoft-Speech-Voice'] = voice;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errText = await response.text();
      agentLogger.error({ msg: 'tts_azure_api_error', status: response.status, error: errText });
      return { success: false, error: `Azure TTS ${response.status}` };
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    if (audioBuffer.length === 0) {
      return { success: false, error: 'Azure TTS returned empty audio' };
    }

    fs.writeFileSync(outputPath, audioBuffer);

    const fileSize = fs.statSync(outputPath).size;
    const bytesPerSec = wantOpus ? 6000 : 12000;
    const durationSec = Math.round(fileSize / bytesPerSec);

    agentLogger.info({
      msg: 'tts_done',
      voice,
      rate,
      text: text.substring(0, 200),
      path: outputPath,
      bytes: fileSize,
      durationSec,
    });
    trackTts(countBillableChars(text, needsSsml ? body : undefined), durationSec);
    return { success: true, filePath: outputPath, durationSec };
  } catch (err) {
    const error = err as Error;
    agentLogger.error({ msg: 'tts_error', error: error.message });
    return { success: false, error: `Azure TTS failed: ${error.message}` };
  }
}

// ── SSML Builder ─────────────────────────────────────────────────────────────

function buildSsml(text: string, voice: string, rate: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Skip <prosody> when rate is default — saves billable characters
  const content = (rate === '+0%' || rate === '0%')
    ? escaped
    : `<prosody rate="${rate}">${escaped}</prosody>`;

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${voice}">
    ${content}
  </voice>
</speak>`;
}
