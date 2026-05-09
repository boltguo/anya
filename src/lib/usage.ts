/**
 * @module lib/usage
 * @description Centralized analytics and cost-tracking engine for third-party API dependencies.
 *
 * Persists high-resolution usage metrics directly to SQLite (`state.db → usage_events`),
 * capturing granular invocation and throughput data:
 * - LLM: Network calls, discrete input/output, and cache token distributions.
 * - TTS (Azure): Synthesis requests, billable SSML character volume, output duration.
 * - STT (Groq): Transcription requests, inbound audio duration.
 * - Pronunciation Assessment (Azure): Evaluation requests, processed duration.
 * - Web Search (Tavily) & Vision (Gemini): Discrete API invocations.
 *
 * Implements strict append-only telemetry via single atomic `INSERT` operations,
 * guaranteeing zero concurrency collisions across disparate application services
 * (e.g., UI vs Gateway daemons). Metrics are deterministically rolled up via 
 * `SUM/GROUP BY` read projections.
 */

import { getDb } from '../storage/db.js';

// ── Schema Initialization ────────────────────────────────────────────────────

let _schemaReady = false;

function ensureSchema(): void {
  if (_schemaReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      day TEXT NOT NULL,
      service TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      calls INTEGER NOT NULL DEFAULT 1,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0,
      chars INTEGER NOT NULL DEFAULT 0,
      duration_sec REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_usage_month ON usage_events(month, service);
  `);
  // Migration: add provider column to existing tables
  try { db.exec(`ALTER TABLE usage_events ADD COLUMN provider TEXT NOT NULL DEFAULT ''`); } catch { /* already exists */ }
  _schemaReady = true;
}

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

  /** LLM stats broken down by provider (gemini, codex) */
  llm_by_provider: Record<string, {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  }>;

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

  vision: {
    calls: number;
  };

  /** Per-day STT breakdown, keyed by DD (01-31) */
  stt_daily: Record<string, DailySttUsage>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentDay(): string {
  return String(new Date().getDate()).padStart(2, '0');
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

// ── Load (Aggregated Read) ───────────────────────────────────────────────────

function emptyUsage(month: string): MonthlyUsage {
  return {
    month,
    llm: { calls: 0, input_tokens: 0, output_tokens: 0, cached_tokens: 0 },
    llm_by_provider: {},
    tts: { calls: 0, chars: 0, duration_sec: 0 },
    stt: { calls: 0, duration_sec: 0 },
    pron_assess: { calls: 0, duration_sec: 0 },
    web_search: { calls: 0 },
    vision: { calls: 0 },
    stt_daily: {},
  };
}

export function loadUsage(month?: string): MonthlyUsage {
  ensureSchema();
  const m = month || currentMonth();
  const db = getDb();

  const usage = emptyUsage(m);

  // Aggregate all events for the month in one query
  const rows = db.prepare(`
    SELECT service,
           SUM(calls) AS total_calls,
           SUM(input_tokens) AS total_input_tokens,
           SUM(output_tokens) AS total_output_tokens,
           SUM(cached_tokens) AS total_cached_tokens,
           SUM(chars) AS total_chars,
           SUM(duration_sec) AS total_duration_sec
    FROM usage_events
    WHERE month = ?
    GROUP BY service
  `).all(m) as Array<{
    service: string;
    total_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cached_tokens: number;
    total_chars: number;
    total_duration_sec: number;
  }>;

  for (const row of rows) {
    switch (row.service) {
      case 'llm':
        usage.llm.calls += Number(row.total_calls);
        usage.llm.input_tokens += Number(row.total_input_tokens);
        usage.llm.output_tokens += Number(row.total_output_tokens);
        usage.llm.cached_tokens += Number(row.total_cached_tokens);
        break;
      case 'tts':
        usage.tts = {
          calls: Number(row.total_calls),
          chars: Number(row.total_chars),
          duration_sec: Number(row.total_duration_sec),
        };
        break;
      case 'stt':
        usage.stt = {
          calls: Number(row.total_calls),
          duration_sec: Number(row.total_duration_sec),
        };
        break;
      case 'pron_assess':
        usage.pron_assess = {
          calls: Number(row.total_calls),
          duration_sec: Number(row.total_duration_sec),
        };
        break;
      case 'web_search':
        usage.web_search = { calls: Number(row.total_calls) };
        break;
      case 'vision':
        usage.vision = { calls: Number(row.total_calls) };
        break;
    }
  }

  // STT daily breakdown
  const dailyRows = db.prepare(`
    SELECT day, SUM(calls) AS total_calls, SUM(duration_sec) AS total_duration
    FROM usage_events
    WHERE month = ? AND service = 'stt'
    GROUP BY day
  `).all(m) as Array<{ day: string; total_calls: number; total_duration: number }>;

  for (const row of dailyRows) {
    usage.stt_daily[row.day] = {
      calls: Number(row.total_calls),
      duration_sec: Number(row.total_duration),
    };
  }

  // LLM per-provider breakdown
  const providerRows = db.prepare(`
    SELECT provider,
           SUM(calls) AS total_calls,
           SUM(input_tokens) AS total_input,
           SUM(output_tokens) AS total_output,
           SUM(cached_tokens) AS total_cached
    FROM usage_events
    WHERE month = ? AND service = 'llm' AND provider != ''
    GROUP BY provider
  `).all(m) as Array<{
    provider: string;
    total_calls: number;
    total_input: number;
    total_output: number;
    total_cached: number;
  }>;

  for (const row of providerRows) {
    usage.llm_by_provider[row.provider] = {
      calls: Number(row.total_calls),
      input_tokens: Number(row.total_input),
      output_tokens: Number(row.total_output),
      cached_tokens: Number(row.total_cached),
    };
  }
  return usage;
}

// ── Track Functions (Atomic INSERT) ──────────────────────────────────────────

/**
 * Track LLM API call with token counts.
 * @param inputTokens - Total input tokens.
 * @param outputTokens - Output tokens generated.
 * @param cachedTokens - Tokens served from cache.
 * @param provider - Provider name (e.g., 'gemini', 'codex').
 */
export function trackLlm(inputTokens: number, outputTokens: number, cachedTokens = 0, provider = ''): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, provider, calls, input_tokens, output_tokens, cached_tokens)
    VALUES (?, ?, 'llm', ?, 1, ?, ?, ?)
  `).run(currentMonth(), currentDay(), provider, inputTokens, outputTokens, cachedTokens);
}

/**
 * Track a TTS call.
 * @param chars - Number of billable characters
 * @param durationSec - Audio duration in seconds
 */
export function trackTts(chars: number, durationSec: number): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, calls, chars, duration_sec)
    VALUES (?, ?, 'tts', 1, ?, ?)
  `).run(currentMonth(), currentDay(), chars, durationSec);
}

/**
 * Track a pronunciation assessment call.
 * @param durationSec - Audio duration assessed in seconds
 */
export function trackPronAssess(durationSec: number): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, calls, duration_sec)
    VALUES (?, ?, 'pron_assess', 1, ?)
  `).run(currentMonth(), currentDay(), durationSec);
}

/**
 * Track an STT (speech-to-text) call.
 * @param durationSec - Audio duration transcribed in seconds
 */
export function trackStt(durationSec: number): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, calls, duration_sec)
    VALUES (?, ?, 'stt', 1, ?)
  `).run(currentMonth(), currentDay(), durationSec);
}

/**
 * Track a web search call.
 */
export function trackWebSearch(): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, calls)
    VALUES (?, ?, 'web_search', 1)
  `).run(currentMonth(), currentDay());
}

/**
 * Track a Vision (Gemini) call.
 */
export function trackVision(): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, calls)
    VALUES (?, ?, 'vision', 1)
  `).run(currentMonth(), currentDay());
}
