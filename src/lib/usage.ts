/**
 * @module lib/usage
 * @description Usage tracking for all metered services.
 *
 * Tracks monthly usage in ~/.anya/data/usage/YYYY-MM.json:
 * - LLM: calls, input/output/cached tokens
 * - TTS (Azure): calls, billable characters, audio duration
 * - STT (Groq): calls, audio duration
 * - Pronunciation Assessment (Azure): calls, audio duration
 * - Web Search (Tavily): calls
 *
 * Azure TTS SSML billing: only text content is counted, XML tags are excluded.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANYA_HOME } from './paths.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DailySttUsage {
  calls: number;
  duration_sec: number;
}

export interface MonthlyUsage {
  month: string; // YYYY-MM

  llm: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  };

  tts: {
    calls: number;
    chars: number;         // billable characters (text only, no SSML tags)
    duration_sec: number;  // total audio duration
  };

  stt: {
    calls: number;
    duration_sec: number;  // total audio duration transcribed
  };

  pron_assess: {
    calls: number;
    duration_sec: number;  // total audio duration assessed
  };

  web_search: {
    calls: number;
  };

  /** Per-day STT breakdown, keyed by DD (01-31) */
  stt_daily: Record<string, DailySttUsage>;
}

// ── Paths ────────────────────────────────────────────────────────────────────

const USAGE_DIR = join(ANYA_HOME, 'data', 'usage');

function usagePath(month: string): string {
  return join(USAGE_DIR, `${month}.json`);
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentDay(): string {
  return String(new Date().getDate()).padStart(2, '0');
}

function emptyDailyStt(): DailySttUsage {
  return { calls: 0, duration_sec: 0 };
}

// ── Load / Save ──────────────────────────────────────────────────────────────

function emptyUsage(month: string): MonthlyUsage {
  return {
    month,
    llm: { calls: 0, input_tokens: 0, output_tokens: 0, cached_tokens: 0 },
    tts: { calls: 0, chars: 0, duration_sec: 0 },
    stt: { calls: 0, duration_sec: 0 },
    pron_assess: { calls: 0, duration_sec: 0 },
    web_search: { calls: 0 },
    stt_daily: {},
  };
}

export function loadUsage(month?: string): MonthlyUsage {
  const m = month || currentMonth();
  const p = usagePath(m);
  if (!existsSync(p)) return emptyUsage(m);

  try {
    const raw = readFileSync(p, 'utf-8');
    const data = JSON.parse(raw) as Partial<MonthlyUsage>;
    const empty = emptyUsage(m);
    return {
      ...empty,
      ...data,
      llm: { ...empty.llm, ...(data.llm || {}) },
      tts: { ...empty.tts, ...(data.tts || {}) },
      stt: { ...empty.stt, ...(data.stt || {}) },
      pron_assess: { ...empty.pron_assess, ...(data.pron_assess || {}) },
      web_search: { ...empty.web_search, ...(data.web_search || {}) },
      stt_daily: data.stt_daily || {},
    };
  } catch {
    return emptyUsage(m);
  }
}

function saveUsage(usage: MonthlyUsage): void {
  mkdirSync(USAGE_DIR, { recursive: true });
  writeFileSync(usagePath(usage.month), JSON.stringify(usage, null, 2) + '\n', 'utf-8');
}

// ── SSML Character Counting ──────────────────────────────────────────────────

/**
 * Count billable characters for Azure TTS.
 *
 * Azure billing rules:
 *  - Everything inside the SSML is counted (text + tags + attributes)
 *  - EXCEPT: <speak> and <voice> tags (and their attributes) are excluded
 *  - CJK characters (Chinese, Japanese Kanji, Korean Hanja) count as 2 each
 *
 * If input is plain text (no SSML wrapper yet), we count the text that will
 * be wrapped by buildSsml — the <speak> and <voice> tags are free, but
 * <prosody rate="..."> and the text itself are billable.
 */
export function countBillableChars(text: string, ssml?: string): number {
  const source = ssml || text;

  // Strip only <speak> and <voice> tags (the two exceptions Azure doesn't charge)
  const billable = source
    .replace(/<\/?speak[^>]*>/gi, '')
    .replace(/<\/?voice[^>]*>/gi, '');

  // CJK chars count as 2 (Unicode ranges for CJK Unified Ideographs)
  let count = 0;
  for (const char of billable) {
    const code = char.codePointAt(0)!;
    // CJK Unified Ideographs + extensions
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified
      (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
      (code >= 0x20000 && code <= 0x2A6DF) || // CJK Extension B
      (code >= 0xF900 && code <= 0xFAFF)      // CJK Compatibility
    ) {
      count += 2;
    } else {
      count += 1;
    }
  }

  return count;
}

// ── Track Functions ──────────────────────────────────────────────────────────

/**
 * Track LLM API call with token counts.
 */
export function trackLlm(inputTokens: number, outputTokens: number, cachedTokens = 0): void {
  const usage = loadUsage();
  usage.llm.calls++;
  usage.llm.input_tokens += inputTokens;
  usage.llm.output_tokens += outputTokens;
  usage.llm.cached_tokens += cachedTokens;
  saveUsage(usage);
}

/**
 * Track a TTS call.
 * @param chars - Number of billable characters
 * @param durationSec - Audio duration in seconds
 */
export function trackTts(chars: number, durationSec: number): void {
  const usage = loadUsage();
  usage.tts.calls++;
  usage.tts.chars += chars;
  usage.tts.duration_sec += durationSec;
  saveUsage(usage);
}

/**
 * Track a pronunciation assessment call.
 * @param durationSec - Audio duration assessed in seconds
 */
export function trackPronAssess(durationSec: number): void {
  const usage = loadUsage();
  usage.pron_assess.calls++;
  usage.pron_assess.duration_sec += durationSec;
  saveUsage(usage);
}

/**
 * Track an STT (speech-to-text) call.
 * @param durationSec - Audio duration transcribed in seconds
 */
export function trackStt(durationSec: number): void {
  const usage = loadUsage();
  usage.stt.calls++;
  usage.stt.duration_sec += durationSec;
  // daily accumulator
  const day = currentDay();
  if (!usage.stt_daily[day]) usage.stt_daily[day] = emptyDailyStt();
  usage.stt_daily[day].calls++;
  usage.stt_daily[day].duration_sec += durationSec;
  saveUsage(usage);
}

/**
 * Track a web search call.
 */
export function trackWebSearch(): void {
  const usage = loadUsage();
  usage.web_search.calls++;
  saveUsage(usage);
}
