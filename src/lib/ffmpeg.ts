/**
 * @module lib/ffmpeg
 * @description Centralized FFmpeg process execution and audio formatting utilities.
 *
 * Facilitates audio conversions, primarily:
 * - OGG/Opus → WAV (Azure Speech Pronunciation Assessment performs best with uncompressed WAV)
 *
 * Implements fallback strategies to automatically resolve the FFmpeg binary
 * across different operating systems and system PATH configurations.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { agentLogger } from './logger.js';

// ── FFmpeg Path Resolution ───────────────────────────────────────────────────

/** 
 * Internal cache for the resolved FFmpeg binary path.
 * - `null`: Checked, but not found.
 * - `undefined`: Unchecked.
 */
let _ffmpegPath: string | null | undefined;

/**
 * Locates the FFmpeg binary by probing common filesystem locations and inspecting the system PATH.
 *
 * @returns {string | null} The absolute path to the FFmpeg executable, or null if not discovered.
 */
export function getFFmpegPath(): string | null {
  if (_ffmpegPath !== undefined) return _ffmpegPath;

  // Primary inspection locations across diverse environments
  const candidates = [
    '/opt/homebrew/bin/ffmpeg',   // macOS Apple Silicon (Homebrew)
    '/usr/local/bin/ffmpeg',      // macOS Intel (Homebrew) / standard Linux
    '/usr/bin/ffmpeg',            // Native Linux package manager installs
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      _ffmpegPath = p;
      agentLogger.info({ msg: 'ffmpeg_found', path: p });
      return p;
    }
  }

  // Secondary fallback: probe utilizing the system 'which' utility
  try {
    const result = execFileSync('which', ['ffmpeg'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      // Synthesize an enriched PATH accommodating environments where PATH isn't globally exposed
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
    }).trim();
    if (result) {
      _ffmpegPath = result;
      agentLogger.info({ msg: 'ffmpeg_found', path: result });
      return result;
    }
  } catch {
    // Binary resolution via 'which' failed
  }

  _ffmpegPath = null;
  agentLogger.warn({ msg: 'ffmpeg_not_found' });
  return null;
}

// ── Conversion Functions ─────────────────────────────────────────────────────

/**
 * Transcodes an OGG/Opus audio file into a WAV format.
 * Target format is specifically strictly constrained to 16kHz mono 16-bit PCM WAV,
 * satisfying requirements for downstream processing via Azure Speech assessment tools.
 *
 * @param {string} inputPath - The absolute filesystem path to the source audio file.
 * @returns {string | null} The absolute path to the resulting WAV file, or null upon failure.
 */
export function convertToWav(inputPath: string): string | null {
  const ffmpeg = getFFmpegPath();
  if (!ffmpeg) return null;

  const wavPath = inputPath.replace(/\.(ogg|oga|webm)$/, '.wav');
  if (inputPath === wavPath) return inputPath;

  try {
    // Block thread execution synchronously as files are small and conversion is fast
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
