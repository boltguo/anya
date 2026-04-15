/**
 * @module lib/tts
 * @description Text-to-Speech service using Azure Speech (full SSML support).
 *
 * Features:
 *   - Azure Neural voices (100+ voices, 40+ languages)
 *   - Full SSML: <phoneme>, <emphasis>, <break>, <lang>, prosody
 *   - Direct OGG Opus output for Telegram (no ffmpeg needed)
 *   - Silent fallback to Edge TTS if Azure is unavailable
 *
 * Configuration: config.tts { voice, rate }, config.azure { speech_key, speech_region }
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TTS_DIR } from './paths.js';
import { agentLogger } from './logger.js';
import { getFFmpegPath, convertToOgg } from './ffmpeg.js';
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
 * Generate speech audio from text via Azure TTS.
 * Falls back to Edge TTS silently if Azure key is missing or API fails.
 */
export async function textToSpeech(
  text: string,
  config: AnyaConfig,
  opts?: TtsOptions,
): Promise<TtsResult> {
  if (!text?.trim() && !opts?.ssml) {
    return { success: false, error: 'Text is required' };
  }

  // Azure TTS (primary)
  if (config.azure?.speech_key) {
    const result = await azureTts(text, config, opts);
    if (result.success) return result;
    // Azure failed, fall through to Edge
    agentLogger.info({ msg: 'tts_azure_fallback_to_edge' });
  }

  // Edge TTS (fallback)
  return edgeTts(text, config, opts);
}

// ── Azure TTS ────────────────────────────────────────────────────────────────

async function azureTts(
  text: string,
  config: AnyaConfig,
  opts?: TtsOptions,
): Promise<TtsResult> {
  const speechKey = config.azure.speech_key;
  const speechRegion = config.azure.speech_region || 'eastasia';
  const ttsConfig = config.tts ?? {};
  const voice = opts?.voice || ttsConfig.voice || DEFAULT_VOICE;
  const rate = opts?.rate || ttsConfig.rate || DEFAULT_RATE;
  const wantOpus = opts?.format === 'opus';

  const maxLen = 8000;
  if (text.length > maxLen) text = text.substring(0, maxLen);

  const ssml = opts?.ssml || buildSsml(text, voice, rate);
  const timestamp = Date.now();
  const outputFormat = wantOpus ? 'ogg-48khz-16bit-mono-opus' : 'audio-24khz-96kbitrate-mono-mp3';
  const ext = wantOpus ? '.ogg' : '.mp3';
  const outputPath = path.join(TTS_DIR, `tts_${timestamp}${ext}`);

  fs.mkdirSync(TTS_DIR, { recursive: true });

  try {
    agentLogger.info({ msg: 'tts_start', backend: 'azure', voice, rate, format: wantOpus ? 'opus' : 'mp3' });

    const url = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': outputFormat,
        'User-Agent': 'Anya-TTS',
      },
      body: ssml,
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

    agentLogger.info({ msg: 'tts_done', backend: 'azure', path: outputPath, bytes: fileSize, durationSec });
    trackTts(countBillableChars(text, opts?.ssml), durationSec);
    return { success: true, filePath: outputPath, durationSec };
  } catch (err) {
    const error = err as Error;
    agentLogger.error({ msg: 'tts_error', backend: 'azure', error: error.message });
    return { success: false, error: `Azure TTS failed: ${error.message}` };
  }
}

// ── Edge TTS (fallback) ──────────────────────────────────────────────────────

async function edgeTts(
  text: string,
  config: AnyaConfig,
  opts?: TtsOptions,
): Promise<TtsResult> {
  const maxLen = 4000;
  if (text.length > maxLen) text = text.substring(0, maxLen);

  const ttsConfig = config.tts ?? {};
  const voice = opts?.voice || ttsConfig.voice || DEFAULT_VOICE;
  const rate = opts?.rate || ttsConfig.rate || DEFAULT_RATE;
  const wantOpus = opts?.format === 'opus';

  const outputFormat = wantOpus
    ? OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS
    : OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;

  const timestamp = Date.now();
  const ext = wantOpus ? '.webm' : '.mp3';
  const outputPath = path.join(TTS_DIR, `tts_${timestamp}${ext}`);

  fs.mkdirSync(TTS_DIR, { recursive: true });

  try {
    agentLogger.info({ msg: 'tts_start', backend: 'edge_fallback', voice, rate });

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, outputFormat);

    const tmpDir = outputPath + '_tmp';
    fs.mkdirSync(tmpDir, { recursive: true });
    const result = await tts.toFile(tmpDir, text, { rate });

    const generatedFile = result.audioFilePath;
    if (generatedFile && fs.existsSync(generatedFile)) {
      fs.renameSync(generatedFile, outputPath);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      return { success: false, error: 'TTS generated empty output' };
    }

    let finalPath = outputPath;
    if (wantOpus && getFFmpegPath()) {
      const oggPath = convertToOgg(outputPath);
      if (oggPath) finalPath = oggPath;
    }

    const fileSize = fs.statSync(finalPath).size;
    const bytesPerSec = wantOpus ? 8000 : 12000;
    const durationSec = Math.round(fileSize / bytesPerSec);

    agentLogger.info({ msg: 'tts_done', backend: 'edge_fallback', path: finalPath, bytes: fileSize, durationSec });
    trackTts(text.length, durationSec);
    return { success: true, filePath: finalPath, durationSec };
  } catch (err) {
    const error = err as Error;
    agentLogger.error({ msg: 'tts_error', backend: 'edge_fallback', error: error.message });
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    return { success: false, error: `Edge TTS failed: ${error.message}` };
  }
}

// ── SSML Builder ─────────────────────────────────────────────────────────────

function buildSsml(text: string, voice: string, rate: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${voice}">
    <prosody rate="${rate}">
      ${escaped}
    </prosody>
  </voice>
</speak>`;
}

// ── Utility ──────────────────────────────────────────────────────────────────

export async function listVoices(): Promise<Array<{ name: string; locale: string; gender: string }>> {
  try {
    const tts = new MsEdgeTTS();
    const voices = await tts.getVoices();
    return voices.map((v: any) => ({
      name: v.ShortName || v.Name,
      locale: v.Locale,
      gender: v.Gender,
    }));
  } catch {
    return [];
  }
}
