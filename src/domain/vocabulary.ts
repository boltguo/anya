// domain/vocabulary.ts — vocabulary SRS state and actions

import type { DatabaseSync } from 'node:sqlite';
import {
  type WordEntry,
  withTransaction, optionalNumber, normalizeJsonString, normalizeRowId,
  nowSql, clampInt, parseJsonList, upsertActivity,
} from './helpers.js';

// SM-2 variant: EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02)), floor 1.3
export function nextSrsState(reviewCount: number, oldInterval: number, oldEase: number, rating: number): [number, number] {
  const safeRating = clampInt(rating, 0, 5);
  const ease = Math.max(1.3, oldEase + (0.1 - (5 - safeRating) * (0.08 + (5 - safeRating) * 0.02)));
  if (safeRating < 3) return [1, ease];
  if (reviewCount <= 0) return [1, ease];
  if (reviewCount === 1) return [3, ease];
  if (reviewCount === 2) return [7, ease];
  return [Math.min(90, Math.max(1, Math.round(oldInterval * ease))), ease];
}

function parseWordEntries(args: Record<string, unknown>): WordEntry[] {
  if (args.words) return parseJsonList<WordEntry>(args.words, 'words');
  if (args.word) return [args as WordEntry];
  return [];
}

export function upsertWords(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const entries = parseWordEntries(args);
  if (entries.length === 0) return { error: 'Missing word or words' };

  return withTransaction(db, () => {
    const stmt = db.prepare(`
      INSERT INTO words (
        word, item_kind, definition, chinese, ipa, pos, collocations, topics,
        example_en, example_cn, audio_path, mastery, origin, source_sample_id,
        priority, transfer_level, is_user_word, srs_due, introduced_at,
        created_at, updated_at, metadata
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'),
        datetime('now'), datetime('now'), ?
      )
      ON CONFLICT(word) DO UPDATE SET
        item_kind=CASE WHEN excluded.item_kind != '' THEN excluded.item_kind ELSE words.item_kind END,
        definition=CASE WHEN excluded.definition != '' THEN excluded.definition ELSE words.definition END,
        chinese=CASE WHEN excluded.chinese != '' THEN excluded.chinese ELSE words.chinese END,
        ipa=CASE WHEN excluded.ipa != '' THEN excluded.ipa ELSE words.ipa END,
        pos=CASE WHEN excluded.pos != '' THEN excluded.pos ELSE words.pos END,
        collocations=CASE WHEN excluded.collocations != '' THEN excluded.collocations ELSE words.collocations END,
        topics=CASE WHEN excluded.topics != '' THEN excluded.topics ELSE words.topics END,
        example_en=CASE WHEN excluded.example_en != '' THEN excluded.example_en ELSE words.example_en END,
        example_cn=CASE WHEN excluded.example_cn != '' THEN excluded.example_cn ELSE words.example_cn END,
        audio_path=CASE WHEN excluded.audio_path != '' THEN excluded.audio_path ELSE words.audio_path END,
        mastery=CASE WHEN words.mastery = 'mastered' THEN words.mastery ELSE excluded.mastery END,
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
      const result = stmt.run(
        word,
        String(entry.item_kind || args.item_kind || 'word'),
        String(entry.definition || args.definition || ''),
        String(entry.chinese || entry.translation || args.chinese || ''),
        String(entry.ipa || args.ipa || ''),
        String(entry.pos || args.pos || ''),
        String(entry.collocations || args.collocations || ''),
        String(entry.topics || args.topics || ''),
        String(entry.example_en || args.example_en || ''),
        String(entry.example_cn || args.example_cn || ''),
        String(entry.audio_path || args.audio_path || ''),
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
    }
    upsertActivity(db, 0, 'vocab', 0, changed);
    return { ok: true, action: 'word_upsert', count: entries.length, changes: changed };
  });
}

export function reviewWord(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const word = String(args.word || '').trim();
  if (!word) return { error: 'Missing word' };
  const rating = clampInt(Number(args.rating ?? (Number(args.passed ?? 0) ? 4 : 1)), 0, 5);
  const passed = rating >= 3 ? 1 : 0;
  const sessionId = String(args.session_id || '');
  const context = String(args.context || '');
  const cardType = String(args.card_type || 'recall');

  return withTransaction(db, () => {
    const row = db.prepare('SELECT review_count, srs_interval_days, srs_ease FROM words WHERE word = ?').get(word) as {
      review_count?: number; srs_interval_days?: number; srs_ease?: number;
    } | undefined;
    if (!row) throw new Error(`word not found: ${word}`);

    const [intervalDays, ease] = nextSrsState(Number(row.review_count || 0), Number(row.srs_interval_days || 0), Number(row.srs_ease || 2.5), rating);
    db.prepare(`
      UPDATE words
      SET review_count = review_count + 1,
          success_count = success_count + ?,
          fail_count = fail_count + ?,
          last_result = ?,
          srs_due = datetime('now', ?),
          srs_interval_days = ?,
          srs_ease = ?,
          last_seen_at = datetime('now'),
          updated_at = datetime('now'),
          transfer_level = CASE WHEN ? = 1 THEN MAX(transfer_level, ?) ELSE transfer_level END,
          mastery = CASE
            WHEN ? = 1 AND success_count + 1 >= 5 THEN 'mastered'
            WHEN ? = 1 AND success_count + 1 >= 3 THEN 'known'
            WHEN mastery = 'queued_new' THEN 'learning'
            ELSE mastery
          END
      WHERE word = ?
    `).run(
      passed, passed ? 0 : 1, passed ? 'pass' : 'fail',
      `+${intervalDays} days`, intervalDays, ease,
      passed, Number(args.transfer_level ?? 0),
      passed, passed, word,
    );
    db.prepare(`
      INSERT INTO word_reviews (word, session_id, rating, passed, interval_days, card_type, context)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(word, sessionId, rating, passed, intervalDays, cardType, context);
    upsertActivity(db, 0, 'vocab', 1, 0);
    return { ok: true, action: 'word_review', word, rating, passed, interval_days: intervalDays };
  });
}

export function dueWords(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const limit = clampInt(Number(args.limit ?? 8), 1, 20);
  const topic = String(args.topics || args.topic || '').trim();
  const params: unknown[] = [];
  let topicClause = '';
  if (topic) {
    topicClause = 'AND topics LIKE ?';
    params.push(`%${topic}%`);
  }
  params.push(limit);
  const rows = db.prepare(`
    SELECT word, item_kind, definition, chinese, ipa, pos, collocations, topics,
           example_en, example_cn, audio_path, mastery, transfer_level,
           review_count, success_count, fail_count, srs_due
    FROM words
    WHERE mastery IN ('queued_new','learning','known')
      AND (srs_due IS NULL OR srs_due <= datetime('now'))
      ${topicClause}
    ORDER BY is_user_word DESC, priority DESC, srs_due ASC, updated_at ASC
    LIMIT ?
  `).all(...params as []);
  return { ok: true, action: 'due_words', rows, count: rows.length };
}

export function wordLookup(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const word = String(args.word || '').trim();
  if (!word) return { error: 'Missing word' };
  const row = db.prepare('SELECT * FROM words WHERE word = ?').get(word);
  return { ok: true, action: 'word_lookup', found: Boolean(row), row };
}
