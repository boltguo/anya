// media/tts.ts — Azure Neural text-to-speech

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TTS_DIR } from '../lib/paths.js';
import { agentLogger } from '../lib/logger.js';
import { trackTts, countBillableChars } from '../lib/usage.js';
import type { AnyaConfig } from '../config/defaults.js';

const DEFAULT_VOICE = 'en-US-AriaNeural';
const DEFAULT_RATE = '+0%';


export interface TtsOptions {
  voice?: string;
  rate?: string;
  format?: 'opus' | 'mp3';
  ssml?: string;
}

export interface TtsResult {
  success: boolean;
  filePath?: string;
  error?: string;
  durationSec?: number;
}

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
  const voice = opts?.voice || config.tts?.voice || DEFAULT_VOICE;
  const rate = opts?.rate || DEFAULT_RATE;
  const wantOpus = opts?.format === 'opus';

  const maxLen = 8000;
  if (text.length > maxLen) text = text.substring(0, maxLen);

  // Azure TTS REST API requires SSML for Neural voices.
  const body = opts?.ssml || buildSsml(text, voice, rate);

  const timestamp = Date.now();
  const outputFormat = wantOpus ? 'ogg-48khz-16bit-mono-opus' : 'audio-24khz-96kbitrate-mono-mp3';
  const ext = wantOpus ? '.ogg' : '.mp3';
  const outputPath = path.join(TTS_DIR, `tts_${timestamp}${ext}`);

  fs.mkdirSync(TTS_DIR, { recursive: true });

  try {
    agentLogger.info({ msg: 'tts_start', voice, rate, format: wantOpus ? 'opus' : 'mp3', textLen: text.length });

    const url = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': outputFormat,
      'User-Agent': 'Anya-TTS',
    };
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
    trackTts(countBillableChars(text, body), durationSec);
    return { success: true, filePath: outputPath, durationSec };
  } catch (err) {
    const error = err as Error;
    agentLogger.error({ msg: 'tts_error', error: error.message });
    return { success: false, error: `Azure TTS failed: ${error.message}` };
  }
}

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
