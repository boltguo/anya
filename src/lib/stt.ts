/**
 * @module lib/stt
 * @description Speech-to-Text service using Groq Whisper API (free).
 *
 * Usage:
 *   const result = await transcribeAudio('/path/to/voice.ogg', config);
 */

import fs from 'node:fs';
import path from 'node:path';
import { agentLogger } from './logger.js';
import type { AnyaConfig } from '../config/defaults.js';

// ── Groq Whisper config ──────────────────────────────────────────────────────

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'whisper-large-v3-turbo';

const SUPPORTED_FORMATS = new Set([
  '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a',
  '.wav', '.webm', '.ogg', '.aac', '.flac',
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// ── Whisper hallucination filter ─────────────────────────────────────────────

const HALLUCINATIONS = new Set([
  'thank you.', 'thank you', 'thanks for watching.',
  'thanks for watching', 'bye.', 'bye', 'you',
  'the end.', 'the end', '请订阅', '谢谢观看',
]);

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

export interface TranscriptionResult {
  success: boolean;
  transcript: string;
  error?: string;
}

/**
 * Transcribe an audio file using Groq Whisper API.
 *
 * @param filePath - Absolute path to the audio file (.ogg, .mp3, etc.)
 * @param config - Anya config (reads stt.groq_api_key)
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
      error: 'Groq API Key 未配置。运行 anya init 或设置 GROQ_API_KEY 环境变量。',
    };
  }

  try {
    const startTime = Date.now();

    // Build multipart form data
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const model = config.stt.model || DEFAULT_MODEL;

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);
    formData.append('model', model);
    formData.append('response_format', 'text');

    const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errText = await response.text();
      agentLogger.warn({ msg: 'stt_error', status: response.status, error: errText.substring(0, 200) });
      return {
        success: false,
        transcript: '',
        error: `Groq API error (${response.status}): ${errText.substring(0, 100)}`,
      };
    }

    const transcript = (await response.text()).trim();

    // Filter hallucinations
    if (isHallucination(transcript)) {
      agentLogger.info({ msg: 'stt_hallucination_filtered', transcript });
      return { success: true, transcript: '' };
    }

    agentLogger.info({
      msg: 'stt_transcribed',
      model: DEFAULT_MODEL,
      durationMs,
      chars: transcript.length,
    });

    return { success: true, transcript };

  } catch (error) {
    const errMsg = (error as Error).message;
    agentLogger.error({ msg: 'stt_exception', error: errMsg });
    return { success: false, transcript: '', error: `Transcription failed: ${errMsg}` };
  }
}
