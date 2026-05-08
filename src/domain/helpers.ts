/**
 * @module domain/helpers
 * @description Provides core type definitions and utility functions to support the
 * English study domain persistence layer. Isolates common transformation and validation
 * logic from the primary database operations to enhance testability.
 */

import type { DatabaseSync } from 'node:sqlite';

// ── Shared Types ────────────────────────────────────────────────────────────

/**
 * Represents a discrete linguistic error identified within a user's practice sample.
 * @interface ErrorEntry
 */
export interface ErrorEntry {
  /** A stable identifier for the specific type of error (e.g., 'grammar:subject-verb-agreement'). */
  key: string;
  /** The high-level category of the error (e.g., 'listening', 'grammar'). */
  category: string;
  /** An assessment of the error's impact on communication ('low', 'medium', 'high'). */
  severity?: string;
  /** The verbatim text containing the error from the user's input. */
  original?: string;
  /** The suggested correction for the original text. */
  correction?: string;
  /** An explanatory note detailing the grammatical or lexical rule violated. */
  note?: string;
}

/**
 * Represents an analytical score for a specific sub-capability within a task.
 * @interface SubcapEntry
 */
export interface SubcapEntry {
  /** The identifier for the sub-capability (e.g., 'lexical_resource', 'coherence'). */
  key: string;
  /** The numerical score awarded for the capability. */
  score: number;
  /** Textual evidence extracted from the user's response justifying the score. */
  evidence?: string;
}

/**
 * Represents a comprehensive profile for a vocabulary item, supporting spaced repetition.
 * @interface WordEntry
 */
export interface WordEntry {
  /** The vocabulary item itself (word or phrase). */
  word?: string;
  /** The classification of the item (e.g., 'word', 'idiom', 'phrasal_verb'). */
  item_kind?: string;
  /** The English definition of the term. */
  definition?: string;
  /** The Chinese definition or translation of the term. */
  chinese?: string;
  /** Additional translation context or nuance. */
  translation?: string;
  /** The International Phonetic Alphabet representation of pronunciation. */
  ipa?: string;
  /** The part of speech (e.g., 'noun', 'verb'). */
  pos?: string;
  /** Commonly associated words or phrasing. */
  collocations?: string;
  /** Thematic domains where the word frequently appears. */
  topics?: string;
  /** An example sentence demonstrating usage in English. */
  example_en?: string;
  /** The translation of the English example sentence. */
  example_cn?: string;
  /** The relative filepath to the audio pronunciation asset. */
  audio_path?: string;
  /** A discrete descriptor of the user's current mastery level. */
  mastery?: string;
  /** The source or origin context where the word was encountered. */
  origin?: string;
  /** A foreign key referencing the practice sample where the word was extracted. */
  source_sample_id?: number;
  /** The algorithmic priority assigned for review scheduling. */
  priority?: number;
  /** An indicator of the term's difficulty or expected proficiency level. */
  transfer_level?: number;
  /** A boolean flag indicating if the word was manually added by the user. */
  is_user_word?: number;
  /** The ISO timestamp indicating when the item is due for Spaced Repetition System review. */
  srs_due?: string;
  /** Opaque metadata payload for extensibility. */
  metadata?: string;
}

// ── Transaction Helper ──────────────────────────────────────────────────────

/**
 * Executes a closure within a database transaction boundary.
 * Automatically issues a COMMIT upon success or a ROLLBACK upon exception.
 *
 * @template T
 * @param {DatabaseSync} db - The active SQLite database connection.
 * @param {() => T} fn - The synchronous database operations to execute.
 * @returns {T} The result of the executed closure.
 * @throws {Error} Rethrows any exception encountered during the transaction.
 */
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

// ── Type Coercion Utilities ─────────────────────────────────────────────────

/**
 * Safely parses an unknown value into a finite number.
 * Returns null if the value is inherently empty or not a valid number.
 *
 * @param {unknown} value - The arbitrary value to coerce.
 * @returns {number | null} The parsed finite number, or null.
 */
export function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Constrains a given numeric value to fall within an inclusive minimum and maximum bound.
 * Also truncates the value to ensure it is an integer.
 *
 * @param {number} value - The input number to clamp.
 * @param {number} min - The lower bound.
 * @param {number} max - The upper bound.
 * @returns {number} The clamped integer.
 */
export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

/**
 * Normalizes a database row ID identifier, commonly returned as BigInt by `node:sqlite`.
 *
 * @param {number | bigint} value - The potentially BigInt row identifier.
 * @returns {number} The normalized number.
 */
export function normalizeRowId(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

/**
 * Normalizes an unknown value into a stringified JSON representation.
 * Returns empty string for nullish inputs.
 *
 * @param {unknown} value - The value to serialize.
 * @returns {string} The JSON string, or an empty string.
 */
export function normalizeJsonString(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Casts an unknown value into a string representation. Handles basic structural serialization
 * for arrays and objects.
 *
 * @param {unknown} value - The value to stringify.
 * @returns {string} The coerced string.
 */
export function stringifyMaybe(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Generates an SQL-compatible timestamp string for the current moment.
 * Format: `YYYY-MM-DD HH:MM:SS`.
 *
 * @returns {string} The formatted timestamp.
 */
export function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Safely parses an unknown payload into a typed array of objects.
 * Primarily used to process JSON strings passed via tool calls.
 *
 * @template T
 * @param {unknown} value - The string or object representation of the array.
 * @param {string} name - The descriptive name of the parameter for error reporting.
 * @returns {T[]} The parsed and filtered array of objects.
 * @throws {Error} Throws if the parsed structure is not an array.
 */
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

/**
 * Safely parses an unknown payload into a key-value record object.
 *
 * @param {unknown} value - The string or object to parse.
 * @returns {Record<string, unknown>} The parsed object dictionary, or an empty object.
 */
export function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return {};
}

// ── Domain Utilities ────────────────────────────────────────────────────────

/**
 * Infers the high-level domain section (e.g., 'listening', 'speaking') based on a specific skill type identifier.
 *
 * @param {string} skillType - The specific capability being exercised (e.g., 'listening-shadowing').
 * @returns {string} The inferred section. Defaults to 'other'.
 */
export function inferSection(skillType: string): string {
  if (skillType.startsWith('listening')) return 'listening';
  if (skillType.startsWith('speaking')) return 'speaking';
  if (skillType.startsWith('writing')) return 'writing';
  if (skillType.startsWith('reading')) return 'reading';
  if (skillType.startsWith('vocab')) return 'vocab';
  return 'other';
}

/**
 * Translates a textual severity label into a comparable numeric score.
 *
 * @param {string} severity - The textual severity label ('low', 'medium', 'high').
 * @returns {number} The corresponding numeric impact score.
 */
export function severityScore(severity: string): number {
  switch (severity.toLowerCase()) {
    case 'low': return 1;
    case 'high': return 5;
    default: return 3;
  }
}

// ── Shared Activity Tracking ────────────────────────────────────────────────

/**
 * Updates the daily activity aggregate metrics.
 * Utilizes an UPSERT pattern to increment cumulative counters for the current day.
 *
 * @param {DatabaseSync} db - The active SQLite database connection.
 * @param {number} minutes - The total duration of the logged activity in minutes.
 * @param {string} section - The overarching domain section touched during the activity.
 * @param {number} wordsReviewed - The number of vocabulary items reviewed.
 * @param {number} newWordsAdded - The number of novel vocabulary items introduced.
 * @returns {void}
 */
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

/**
 * Updates the rolling moving average for assessed performance bands within a specific section.
 *
 * @param {DatabaseSync} db - The active SQLite database connection.
 * @param {string} section - The domain section the score applies to.
 * @param {number} bandOverall - The overall band score achieved in the recent evaluation.
 * @param {string} source - The system or logic source that provided the assessment.
 * @returns {void}
 */
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
