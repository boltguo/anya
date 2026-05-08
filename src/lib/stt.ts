/**
 * @module lib/stt
 * @description Speech-to-Text (STT) adapter bridging the free Groq Whisper API.
 *
 * Integrates the official `groq-sdk` for rigorous type-safe network interactions.
 * Incorporates a domain-specific filter to mitigate "hallucinations" (spurious output
 * generated from audio silence often emitted by the Whisper model).
 *
 * @example
 * ```typescript
 * const result = await transcribeAudio('/path/to/voice.ogg', config);
 * ```
 */

import fs from 'node:fs';
import path from 'node:path';
import Groq from 'groq-sdk';
import { agentLogger } from './logger.js';
import type { AnyaConfig } from '../config/defaults.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** Default STT model targeting cost-efficiency and speed */
const DEFAULT_MODEL = 'whisper-large-v3-turbo';

/** Allowlist of file extensions accepted by the Groq API */
const SUPPORTED_FORMATS = new Set([
  '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a',
  '.wav', '.webm', '.ogg', '.aac', '.flac',
]);

/** Strict byte-size constraint imposed by remote STT service (25MB) */
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// ── Whisper hallucination filter ─────────────────────────────────────────────

/**
 * Known corpus of spurious strings Whisper generates when interpreting static or noise.
 */
const HALLUCINATIONS = new Set([
  'thank you.', 'thank you', 'thanks for watching.',
  'thanks for watching', 'bye.', 'bye', 'you',
  'the end.', 'the end',
]);

/**
 * Validates whether a transcribed string is likely a model hallucination.
 *
 * @param {string} text - The raw text output from the model.
 * @returns {boolean} True if the text maps to known hallucination signatures.
 */
function isHallucination(text: string): boolean {
  const cleaned = text.trim().toLowerCase();
  if (!cleaned) return true;
  if (HALLUCINATIONS.has(cleaned) || HALLUCINATIONS.has(cleaned.replace(/[.!]/g, ''))) {
    return true;
  }
  if (/^(?:thank you|thanks|bye|you|ok|okay|the end|[.\s,!])+$/i.test(cleaned)) {
    return true;
  }
  return false;
}

// ── Core transcription ───────────────────────────────────────────────────────

/**
 * Return type encapsulation for transcription execution responses.
 */
export interface TranscriptionResult {
  success: boolean;
  transcript: string;
  error?: string;
}

/**
 * Transcribes the audio payload using the Groq Whisper inference endpoint.
 * Implements rigorous preconditions covering file existence, sizing, and formats.
 *
 * @param {string} filePath - The absolute filesystem path to the target audio blob.
 * @param {AnyaConfig} config - The active application configuration (provides API auth).
 * @returns {Promise<TranscriptionResult>} An object containing the parsed text or detailed error strings.
 */
export async function transcribeAudio(
  filePath: string,
  config: AnyaConfig,
): Promise<TranscriptionResult> {
  // Validate file
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_FORMATS.has(ext)) {
    return { success: false, transcript: '', error: `Unsupported format: ${ext}` };
  }

  if (!fs.existsSync(filePath)) {
    return { success: false, transcript: '', error: `File not found: ${filePath}` };
  }

  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    return {
      success: false,
      transcript: '',
      error: `File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 25MB)`,
    };
  }

  // Get API key from config or env
  const apiKey = config.stt.groq_api_key || process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      transcript: '',
      error: 'Groq API key not configured. Run `anya init` or set GROQ_API_KEY env variable.',
    };
  }

  try {
    const startTime = Date.now();
    const model = config.stt.model || DEFAULT_MODEL;

    const groq = new Groq({ apiKey });
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model,
      response_format: 'text',
    });

    const durationMs = Date.now() - startTime;
    const transcript = String(transcription).trim();

    // Filter hallucinations
    if (isHallucination(transcript)) {
      agentLogger.info({ msg: 'stt_hallucination_filtered', transcript });
      return { success: true, transcript: '' };
    }

    agentLogger.info({
      msg: 'stt_transcribed',
      filePath,
      model,
      durationMs,
      chars: transcript.length,
      transcript: transcript.substring(0, 150),
    });

    return { success: true, transcript };

  } catch (error) {
    const errMsg = (error as Error).message;
    agentLogger.error({ msg: 'stt_exception', error: errMsg });
    return { success: false, transcript: '', error: `Transcription failed: ${errMsg}` };
  }
}
