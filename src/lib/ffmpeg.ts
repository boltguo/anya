/**
 * @module lib/ffmpeg
 * @description Shared FFmpeg audio conversion utilities.
 *
 * Currently used for:
 * - Pronunciation Assessment: ogg → wav (Azure Speech works best with WAV)
 *
 * Automatically resolves ffmpeg from multiple PATH locations.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { agentLogger } from './logger.js';

// ── FFmpeg Path Resolution ───────────────────────────────────────────────────

/** Cached ffmpeg path (null = not found, undefined = not yet checked) */
let _ffmpegPath: string | null | undefined;

/**
 * Find the ffmpeg binary, searching common macOS/Linux paths.
 */
export function getFFmpegPath(): string | null {
  if (_ffmpegPath !== undefined) return _ffmpegPath;

  // Check common locations
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',   // macOS Apple Silicon (Homebrew)
    '/usr/local/bin/ffmpeg',      // macOS Intel (Homebrew) / Linux
    '/usr/bin/ffmpeg',            // Linux system install
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      _ffmpegPath = p;
      agentLogger.info({ msg: 'ffmpeg_found', path: p });
      return p;
    }
  }

  // Fallback: try PATH via `which` command
  try {
    const result = execFileSync('which', ['ffmpeg'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
    }).trim();
    if (result) {
      _ffmpegPath = result;
      agentLogger.info({ msg: 'ffmpeg_found', path: result });
      return result;
    }
  } catch { /* not found */ }

  _ffmpegPath = null;
  agentLogger.warn({ msg: 'ffmpeg_not_found' });
  return null;
}

// ── Conversion Functions ─────────────────────────────────────────────────────

/**
 * Convert OGG/Opus to WAV (for Azure Speech pronunciation assessment).
 *
 * Output: 16kHz mono 16-bit PCM WAV.
 *
 * @param inputPath - Path to input .ogg file
 * @returns Path to .wav file, or null if conversion failed
 */
export function convertToWav(inputPath: string): string | null {
  const ffmpeg = getFFmpegPath();
  if (!ffmpeg) return null;

  const wavPath = inputPath.replace(/\.(ogg|oga|webm)$/, '.wav');
  if (inputPath === wavPath) return inputPath;

  try {
    execFileSync(ffmpeg, [
      '-y',
      '-i', inputPath,
      '-ar', '16000',
      '-ac', '1',
      '-sample_fmt', 's16',
      wavPath,
    ], { stdio: 'pipe', timeout: 30000 });

    if (existsSync(wavPath) && statSync(wavPath).size > 0) {
      agentLogger.info({ msg: 'ffmpeg_converted', from: inputPath, to: wavPath, bytes: statSync(wavPath).size });
      return wavPath;
    }
  } catch (err) {
    agentLogger.warn({ msg: 'ffmpeg_convert_failed', error: (err as Error).message });
  }
  return null;
}
