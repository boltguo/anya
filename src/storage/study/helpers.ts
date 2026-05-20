// storage/study/helpers.ts — shared domain types and SQL utilities

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
  // Skills write on the canonical 0-10 scale. Legacy `score` is accepted as an
  // alias for `value` and treated identically (no rescaling).
  value?: number;
  score?: number;
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
  if (skillType.startsWith('placement')) return 'placement';
  return 'other';
}

export function severityScore(severity: string): number {
  switch (severity.toLowerCase()) {
    case 'low': return 1;
    case 'high': return 5;
    default: return 3;
  }
}

// ─── Error-key whitelist validation ───────────────────────────────────────

const _errorKeyCache = new Set<string>();
let _errorKeyCacheLoaded = false;

export function isValidErrorKey(db: DatabaseSync, key: string): boolean {
  if (!_errorKeyCacheLoaded) {
    const rows = db.prepare('SELECT key FROM error_keys').all() as Array<{ key: string }>;
    for (const r of rows) _errorKeyCache.add(r.key);
    _errorKeyCacheLoaded = true;
  }
  return _errorKeyCache.has(key);
}

export function _invalidateErrorKeyCache(): void {
  _errorKeyCache.clear();
  _errorKeyCacheLoaded = false;
}
