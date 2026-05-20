// storage/study/vocabulary.ts — vocabulary SRS state and actions
//
// schema v3 slim:
//   • words dropped: topics (lexical_topics is canonical), lookup_count,
//     last_result, introduced_at, mastered_at, audio_path
//   • word_reviews dropped: passed, session_id, context

import type { DatabaseSync } from 'node:sqlite';
import {
  type WordEntry,
  withTransaction, optionalNumber, normalizeJsonString,
  nowSql, clampInt, parseJsonList,
} from './helpers.js';

// ─── Rating normalization ─────────────────────────────────────────────────
// All three vocab skills (review/testme/topic) feed the canonical 0..5 scale.
//   5  production: clean & natural
//   4  recognition (MC) correct, or production with hesitation
//   3  partial / shaky — barely passes
//   1  wrong / forgotten
//   0  total blank

export function normalizeRating(rating: number): number {
  return clampInt(rating, 0, 5);
}

// SM-2 variant: ease engaged from review 1, graduating intervals ease-scaled,
// mastery transitions allow regression on failure.
export function nextSrsState(
  reviewCount: number,
  oldInterval: number,
  oldEase: number,
  rating: number,
): { interval: number; ease: number } {
  const r = normalizeRating(rating);
  const ease = Math.max(1.3, oldEase + (0.1 - (5 - r) * (0.08 + (5 - r) * 0.02)));

  if (r < 3) return { interval: 1, ease };

  const intensity = r === 5 ? 1.3 : r === 4 ? 1.0 : 0.6;
  let nextInterval: number;
  if (reviewCount <= 0) {
    nextInterval = Math.max(1, Math.round(2 * intensity));
  } else {
    const base = Math.max(1, oldInterval);
    nextInterval = Math.round(base * ease * intensity);
  }
  return { interval: clampInt(nextInterval, 1, 365), ease };
}

function masteryAfterSuccess(currentMastery: string, consecutive: number, lastSuccessAt: string | null): string {
  if (currentMastery === 'mastered') return 'mastered';
  if (consecutive >= 5 && lastSuccessAt) {
    const last = new Date(lastSuccessAt).getTime();
    const now = Date.now();
    if (now - last >= 21 * 24 * 60 * 60 * 1000) return 'mastered';
  }
  if (consecutive >= 3) return 'known';
  if (currentMastery === 'queued_new') return 'learning';
  return currentMastery;
}

function masteryAfterFailure(currentMastery: string): string {
  switch (currentMastery) {
    case 'mastered': return 'known';
    case 'known':    return 'learning';
    case 'learning': return 'learning';
    default:         return 'queued_new';
  }
}

function parseWordEntries(args: Record<string, unknown>): WordEntry[] {
  if (args.words) return parseJsonList<WordEntry>(args.words, 'words');
  if (args.word) return [args as WordEntry];
  return [];
}

function syncLexicalTopics(db: DatabaseSync, word: string, topicsField: string): void {
  if (!topicsField) return;
  let topics: string[] = [];
  try {
    const parsed = JSON.parse(topicsField);
    if (Array.isArray(parsed)) topics = parsed.map((t) => String(t).trim()).filter(Boolean);
  } catch {
    topics = topicsField.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  }
  if (topics.length === 0) return;
  const stmt = db.prepare('INSERT OR IGNORE INTO lexical_topics (word, topic) VALUES (?, ?)');
  for (const t of topics) stmt.run(word, t);
}

export function upsertWords(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const entries = parseWordEntries(args);
  if (entries.length === 0) return { error: 'Missing word or words' };

  return withTransaction(db, () => {
    const stmt = db.prepare(`
      INSERT INTO words (
        word, item_kind, definition, chinese, ipa, pos, collocations,
        example_en, example_cn, mastery, origin, source_sample_id,
        priority, transfer_level, is_user_word, srs_due,
        created_at, updated_at, metadata
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        datetime('now'), datetime('now'), ?
      )
      ON CONFLICT(word) DO UPDATE SET
        item_kind=CASE WHEN excluded.item_kind != '' THEN excluded.item_kind ELSE words.item_kind END,
        definition=CASE WHEN excluded.definition != '' THEN excluded.definition ELSE words.definition END,
        chinese=CASE WHEN excluded.chinese != '' THEN excluded.chinese ELSE words.chinese END,
        ipa=CASE WHEN excluded.ipa != '' THEN excluded.ipa ELSE words.ipa END,
        pos=CASE WHEN excluded.pos != '' THEN excluded.pos ELSE words.pos END,
        collocations=CASE WHEN excluded.collocations != '' THEN excluded.collocations ELSE words.collocations END,
        example_en=CASE WHEN excluded.example_en != '' THEN excluded.example_en ELSE words.example_en END,
        example_cn=CASE WHEN excluded.example_cn != '' THEN excluded.example_cn ELSE words.example_cn END,
        mastery=CASE
          WHEN excluded.mastery != '' AND words.mastery = 'queued_new' THEN excluded.mastery
          ELSE words.mastery
        END,
        origin=CASE WHEN excluded.origin != '' THEN excluded.origin ELSE words.origin END,
        source_sample_id=COALESCE(excluded.source_sample_id, words.source_sample_id),
        priority=MAX(words.priority, excluded.priority),
        transfer_level=MAX(words.transfer_level, excluded.transfer_level),
        is_user_word=MAX(words.is_user_word, excluded.is_user_word),
        srs_due=COALESCE(words.srs_due, excluded.srs_due),
        metadata=CASE WHEN excluded.metadata != '' THEN excluded.metadata ELSE words.metadata END,
        updated_at=datetime('now')
    `);

    let changed = 0;
    for (const entry of entries) {
      const word = String(entry.word || '').trim();
      if (!word) continue;
      const topicsField = String(entry.topics || args.topics || '');
      const result = stmt.run(
        word,
        String(entry.item_kind || args.item_kind || 'word'),
        String(entry.definition || args.definition || ''),
        String(entry.chinese || entry.translation || args.chinese || ''),
        String(entry.ipa || args.ipa || ''),
        String(entry.pos || args.pos || ''),
        String(entry.collocations || args.collocations || ''),
        String(entry.example_en || args.example_en || ''),
        String(entry.example_cn || args.example_cn || ''),
        String(entry.mastery || args.mastery || 'queued_new'),
        String(entry.origin || args.origin || 'practice_harvest'),
        optionalNumber(entry.source_sample_id ?? args.source_sample_id),
        Number(entry.priority ?? args.priority ?? 0),
        Number(entry.transfer_level ?? args.transfer_level ?? 0),
        Number(entry.is_user_word ?? args.is_user_word ?? 0),
        String(entry.srs_due || args.srs_due || nowSql()),
        normalizeJsonString(entry.metadata ?? args.metadata),
      );
      changed += Number(result.changes);
      syncLexicalTopics(db, word, topicsField);
    }
    return { ok: true, action: 'word_upsert', count: entries.length, changes: changed };
  });
}

export function reviewWord(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const word = String(args.word || '').trim();
  if (!word) return { error: 'Missing word' };
  const rating = normalizeRating(Number(args.rating ?? (Number(args.passed ?? 0) ? 4 : 1)));
  const passed = rating >= 3 ? 1 : 0;
  const sampleId = optionalNumber(args.sample_id);
  const cardType = String(args.card_type || 'recall');

  return withTransaction(db, () => {
    const row = db.prepare(`
      SELECT review_count, srs_interval_days, srs_ease, mastery,
             consecutive_success, last_success_at
      FROM words WHERE word = ?
    `).get(word) as {
      review_count?: number; srs_interval_days?: number; srs_ease?: number;
      mastery?: string; consecutive_success?: number; last_success_at?: string;
    } | undefined;
    if (!row) throw new Error(`word not found: ${word}`);

    const reviewCount = Number(row.review_count || 0);
    const oldInterval = Number(row.srs_interval_days || 0);
    const oldEase = Number(row.srs_ease || 2.5);
    const currentMastery = String(row.mastery || 'queued_new');
    const consecutivePrev = Number(row.consecutive_success || 0);
    const lastSuccessAt = row.last_success_at || null;

    const { interval, ease } = nextSrsState(reviewCount, oldInterval, oldEase, rating);

    const consecutive = passed ? consecutivePrev + 1 : 0;
    const nextMastery = passed
      ? masteryAfterSuccess(currentMastery, consecutive, lastSuccessAt)
      : masteryAfterFailure(currentMastery);

    db.prepare(`
      UPDATE words
      SET review_count = review_count + 1,
          success_count = success_count + ?,
          fail_count = fail_count + ?,
          consecutive_success = ?,
          srs_due = datetime('now', ?),
          srs_interval_days = ?,
          srs_ease = ?,
          last_seen_at = datetime('now'),
          last_success_at = CASE WHEN ? = 1 THEN datetime('now') ELSE last_success_at END,
          mastery = ?,
          transfer_level = CASE WHEN ? = 1 THEN MAX(transfer_level, ?) ELSE transfer_level END,
          updated_at = datetime('now')
      WHERE word = ?
    `).run(
      passed, passed ? 0 : 1,
      consecutive,
      `+${interval} days`, interval, ease,
      passed,
      nextMastery,
      passed, Number(args.transfer_level ?? 0),
      word,
    );
    db.prepare(`
      INSERT INTO word_reviews (word, sample_id, rating, interval_days, card_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(word, sampleId, rating, interval, cardType);

    return {
      ok: true,
      action: 'word_review',
      word, rating, passed,
      interval_days: interval,
      ease,
      mastery: nextMastery,
      consecutive_success: consecutive,
    };
  });
}

export function dueWords(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const limit = clampInt(Number(args.limit ?? 8), 1, 20);
  const topic = String(args.topic || '').trim();
  // Mastered re-check is opt-in: planner can request a low-frequency mastered
  // sweep once per learning cycle to defeat Ebbinghaus drop-off.
  const includeMastered = Number(args.include_mastered ?? 0) === 1
    || args.include_mastered === '1' || args.include_mastered === 'true';

  const params: unknown[] = [];
  const whereParts: string[] = [];

  if (includeMastered) {
    whereParts.push(`(
      (mastery IN ('queued_new','learning','known') AND (srs_due IS NULL OR srs_due <= datetime('now')))
      OR
      (mastery = 'mastered' AND (last_seen_at IS NULL OR last_seen_at <= datetime('now','-30 days')))
    )`);
  } else {
    whereParts.push(`mastery IN ('queued_new','learning','known')
      AND (srs_due IS NULL OR srs_due <= datetime('now'))`);
  }

  let joinClause = '';
  if (topic) {
    joinClause = `INNER JOIN lexical_topics lt ON lt.word = words.word AND lt.topic = ?`;
    params.push(topic);
  }
  params.push(limit);

  const rows = db.prepare(`
    SELECT words.word, words.item_kind, words.definition, words.chinese, words.ipa,
           words.pos, words.collocations, words.example_en, words.example_cn,
           words.mastery, words.transfer_level,
           words.review_count, words.success_count, words.fail_count, words.consecutive_success,
           words.srs_due
    FROM words
    ${joinClause}
    WHERE ${whereParts.join(' AND ')}
    ORDER BY words.is_user_word DESC, words.priority DESC, words.srs_due ASC, words.updated_at ASC
    LIMIT ?
  `).all(...params as []);
  return { ok: true, action: 'due_words', rows, count: rows.length, topic: topic || null };
}

export function wordLookup(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const word = String(args.word || '').trim();
  if (!word) return { error: 'Missing word' };
  const row = db.prepare('SELECT * FROM words WHERE word = ?').get(word);
  return { ok: true, action: 'word_lookup', found: Boolean(row), row };
}
