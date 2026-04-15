/**
 * @module lib/tts
 * @description Text-to-Speech service using Edge TTS (free, no API key).
 *
 * Features:
 *   - Microsoft Edge neural voices (100+ voices, 40+ languages)
 *   - Prosody control: rate, pitch, volume
 *   - Opus output for Telegram voice bubbles
 *   - Auto-cleanup of cached audio files
 *
 * Configuration: config.tts { voice, rate, pitch, volume }
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import which from 'which';
import { TTS_DIR } from './paths.js';
import { agentLogger } from './logger.js';
import type { AnyaConfig } from '../config/defaults.js';
import { execFileSync } from 'node:child_process';

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
}

export interface TtsResult {
  success: boolean;
  filePath?: string;
  error?: string;
  /** Duration in seconds (approximate, from file size) */
  durationSec?: number;
}

/** Cached ffmpeg path (null = not found, undefined = not yet checked) */
let _ffmpegPath: string | null | undefined;

function getFFmpegPath(): string | null {
  if (_ffmpegPath === undefined) {
    _ffmpegPath = which.sync('ffmpeg', { nothrow: true });
  }
  return _ffmpegPath;
}

/**
 * Convert webm to OGG Opus (Telegram sendVoice requires .ogg container).
 */
function convertToOgg(inputPath: string): string | null {
  const ffmpeg = getFFmpegPath();
  if (!ffmpeg) return null;
  const oggPath = inputPath.replace(/\.\w+$/, '.ogg');
  if (inputPath === oggPath) return inputPath;
  try {
    execFileSync(ffmpeg, [
      '-i', inputPath,
      '-acodec', 'libopus',
      '-ac', '1',
      '-b:a', '64k',
      '-vbr', 'off',
      oggPath,
      '-y',
    ], { stdio: 'pipe', timeout: 30000 });

    if (fs.existsSync(oggPath) && fs.statSync(oggPath).size > 0) {
      agentLogger.info({ msg: 'ffmpeg_converted', from: inputPath, to: oggPath, bytes: fs.statSync(oggPath).size });
      return oggPath;
    }
  } catch (err) {
    agentLogger.warn({ msg: 'ffmpeg_convert_failed', error: (err as Error).message });
  }
  return null;
}

/**
 * Generate speech audio from text using Edge TTS.
 *
 * @param text - Text to synthesize
 * @param config - Anya config (for tts settings)
 * @param opts - Override options
 * @returns TtsResult with the path to the audio file
 */
export async function textToSpeech(
  text: string,
  config: AnyaConfig,
  opts?: TtsOptions,
): Promise<TtsResult> {
  if (!text?.trim()) {
    return { success: false, error: 'Text is required' };
  }

  // Truncate very long text
  const maxLen = 4000;
  if (text.length > maxLen) {
    text = text.substring(0, maxLen);
  }

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

  // Ensure cache dir exists
  fs.mkdirSync(TTS_DIR, { recursive: true });

  try {
    agentLogger.info({ msg: 'tts_start', voice, rate, format: wantOpus ? 'opus' : 'mp3' });

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, outputFormat);

    // msedge-tts toFile() takes a DIRECTORY path and writes audio.webm/audio.mp3 inside
    const tmpDir = outputPath + '_tmp';
    fs.mkdirSync(tmpDir, { recursive: true });
    const result = await tts.toFile(tmpDir, text, { rate });

    // Move generated file to our target path
    const generatedFile = result.audioFilePath;
    if (generatedFile && fs.existsSync(generatedFile)) {
      fs.renameSync(generatedFile, outputPath);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // Verify file was created
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      return { success: false, error: 'TTS generated empty output' };
    }

    let finalPath = outputPath;

    // For Telegram: convert webm to ogg (sendVoice requires .ogg)
    if (wantOpus && getFFmpegPath()) {
      const oggPath = convertToOgg(outputPath);
      if (oggPath) finalPath = oggPath;
    }

    const fileSize = fs.statSync(finalPath).size;
    const bytesPerSec = wantOpus ? 8000 : 12000;
    const durationSec = Math.round(fileSize / bytesPerSec);

    agentLogger.info({ msg: 'tts_done', path: finalPath, bytes: fileSize, durationSec });

    return { success: true, filePath: finalPath, durationSec };
  } catch (err) {
    const error = err as Error;
    agentLogger.error({ msg: 'tts_error', error: error.message });
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    return { success: false, error: `TTS failed: ${error.message}` };
  }
}

/**
 * List available Edge TTS voices.
 */
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
