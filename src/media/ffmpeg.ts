// media/ffmpeg.ts — ffmpeg binary resolution and audio conversion

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { agentLogger } from '../lib/logger.js';

// null = checked but not found; undefined = unchecked
let _ffmpegPath: string | null | undefined;

export function getFFmpegPath(): string | null {
  if (_ffmpegPath !== undefined) return _ffmpegPath;

  const candidates = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      _ffmpegPath = p;
      agentLogger.info({ msg: 'ffmpeg_found', path: p });
      return p;
    }
  }

  try {
    const result = execFileSync('which', ['ffmpeg'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      // Augment PATH for environments where it's not globally exposed
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
    }).trim();
    if (result) {
      _ffmpegPath = result;
      agentLogger.info({ msg: 'ffmpeg_found', path: result });
      return result;
    }
  } catch {
    // which failed
  }

  _ffmpegPath = null;
  agentLogger.warn({ msg: 'ffmpeg_not_found' });
  return null;
}

// Target: 16kHz mono 16-bit PCM WAV — required by Azure Speech assessment.
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
