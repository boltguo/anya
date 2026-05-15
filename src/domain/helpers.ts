// domain/helpers.ts — shared domain types and SQL utilities

import type { DatabaseSync } from 'node:sqlite';

export interface ErrorEntry {
  key: string;
  category: string;
  severity?: string;
  original?: string;
  correction?: string;
  note?: string;
}

export interface SubcapEntry {
  key: string;
  score: number;
  evidence?: string;
}

export interface WordEntry {
  word?: string;
  item_kind?: string;
  definition?: string;
  chinese?: string;
  translation?: string;
  ipa?: string;
  pos?: string;
  collocations?: string;
  topics?: string;
  example_en?: string;
  example_cn?: string;
  audio_path?: string;
  mastery?: string;
  origin?: string;
  source_sample_id?: number;
  priority?: number;
  transfer_level?: number;
  is_user_word?: number;
  srs_due?: string;
  metadata?: string;
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore rollback errors */ }
    throw err;
  }
}

export function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

// node:sqlite returns row ids as BigInt
export function normalizeRowId(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

export function normalizeJsonString(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function stringifyMaybe(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// SQL timestamp: YYYY-MM-DD HH:MM:SS
export function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function parseJsonList<T>(value: unknown, name: string): T[] {
  if (value === undefined || value === null || value === '') return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) throw new Error(`${name} must be an array`);
    return parsed.filter(x => x && typeof x === 'object') as T[];
  } catch {
    throw new Error(`Invalid ${name} JSON — must be an array`);
  }
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return {};
}

export function inferSection(skillType: string): string {
  if (skillType.startsWith('listening')) return 'listening';
  if (skillType.startsWith('speaking')) return 'speaking';
  if (skillType.startsWith('writing')) return 'writing';
  if (skillType.startsWith('reading')) return 'reading';
  if (skillType.startsWith('vocab')) return 'vocab';
  return 'other';
}

export function severityScore(severity: string): number {
  switch (severity.toLowerCase()) {
    case 'low': return 1;
    case 'high': return 5;
    default: return 3;
  }
}

export function upsertActivity(db: DatabaseSync, minutes: number, section: string, wordsReviewed: number, newWordsAdded: number): void {
  db.prepare(`
    INSERT INTO activity_log (date, sessions_count, minutes_total, sections_touched, words_reviewed, new_words_added)
    VALUES (date('now'), ?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      sessions_count = activity_log.sessions_count + excluded.sessions_count,
      minutes_total = activity_log.minutes_total + excluded.minutes_total,
      words_reviewed = activity_log.words_reviewed + excluded.words_reviewed,
      new_words_added = activity_log.new_words_added + excluded.new_words_added,
      sections_touched = CASE
        WHEN excluded.sections_touched = '' THEN activity_log.sections_touched
        WHEN activity_log.sections_touched = '' THEN excluded.sections_touched
        WHEN INSTR(activity_log.sections_touched, excluded.sections_touched) > 0 THEN activity_log.sections_touched
        ELSE activity_log.sections_touched || ',' || excluded.sections_touched
      END
  `).run(minutes > 0 ? 1 : 0, Math.max(0, minutes), section, wordsReviewed, newWordsAdded);
}

// Incremental running mean: avg' = (avg*n + x) / (n+1)
export function upsertBandTrend(db: DatabaseSync, section: string, bandOverall: number, source: string): void {
  db.prepare(`
    INSERT INTO band_trend (date, section, band_estimate, sample_count, source)
    VALUES (date('now'), ?, ?, 1, ?)
    ON CONFLICT(date, section) DO UPDATE SET
      band_estimate = ROUND((band_trend.band_estimate * band_trend.sample_count + excluded.band_estimate) / (band_trend.sample_count + 1), 2),
      sample_count = band_trend.sample_count + 1,
      source = excluded.source
  `).run(section, bandOverall, source);
}
