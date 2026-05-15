// lib/usage.ts — API usage tracking

import { getDb } from '../storage/state/db.js';

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
  // Migration: add provider column for tables created before it existed
  try { db.exec(`ALTER TABLE usage_events ADD COLUMN provider TEXT NOT NULL DEFAULT ''`); } catch { /* already exists */ }
  _schemaReady = true;
}

export interface DailySttUsage {
  calls: number;
  duration_sec: number;
}

export interface MonthlyUsage {
  month: string;

  llm: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  };

  llm_by_provider: Record<string, {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  }>;

  tts: {
    calls: number;
    chars: number;
    duration_sec: number;
  };

  stt: {
    calls: number;
    duration_sec: number;
  };

  pron_assess: {
    calls: number;
    duration_sec: number;
  };

  web_search: {
    calls: number;
  };

  vision: {
    calls: number;
  };

  stt_daily: Record<string, DailySttUsage>;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentDay(): string {
  return String(new Date().getDate()).padStart(2, '0');
}

// Azure billing rules:
//  - All SSML content is billable EXCEPT <speak>/<voice> tags (and their attrs)
//  - CJK characters count as 2 each
export function countBillableChars(text: string, ssml?: string): number {
  const source = ssml || text;

  const billable = source
    .replace(/<\/?speak[^>]*>/gi, '')
    .replace(/<\/?voice[^>]*>/gi, '');

  let count = 0;
  for (const char of billable) {
    const code = char.codePointAt(0)!;
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0x3400 && code <= 0x4DBF) ||
      (code >= 0x20000 && code <= 0x2A6DF) ||
      (code >= 0xF900 && code <= 0xFAFF)
    ) {
      count += 2;
    } else {
      count += 1;
    }
  }

  return count;
}

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

export function trackLlm(inputTokens: number, outputTokens: number, cachedTokens = 0, provider = ''): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, provider, calls, input_tokens, output_tokens, cached_tokens)
    VALUES (?, ?, 'llm', ?, 1, ?, ?, ?)
  `).run(currentMonth(), currentDay(), provider, inputTokens, outputTokens, cachedTokens);
}

export function trackTts(chars: number, durationSec: number): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, calls, chars, duration_sec)
    VALUES (?, ?, 'tts', 1, ?, ?)
  `).run(currentMonth(), currentDay(), chars, durationSec);
}

export function trackPronAssess(durationSec: number): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, calls, duration_sec)
    VALUES (?, ?, 'pron_assess', 1, ?)
  `).run(currentMonth(), currentDay(), durationSec);
}

export function trackStt(durationSec: number): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, calls, duration_sec)
    VALUES (?, ?, 'stt', 1, ?)
  `).run(currentMonth(), currentDay(), durationSec);
}

export function trackWebSearch(): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, calls)
    VALUES (?, ?, 'web_search', 1)
  `).run(currentMonth(), currentDay());
}

export function trackVision(): void {
  ensureSchema();
  getDb().prepare(`
    INSERT INTO usage_events (month, day, service, calls)
    VALUES (?, ?, 'vision', 1)
  `).run(currentMonth(), currentDay());
}
