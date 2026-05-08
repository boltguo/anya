/**
 * @module domain/profile
 * @description Learner profile management and coaching context aggregation.
 */

import type { DatabaseSync } from 'node:sqlite';
import { withTransaction, parseJsonObject, stringifyMaybe, clampInt, optionalNumber } from './helpers.js';
import { studySummary } from './progress.js';
import { dueWords } from './vocabulary.js';
import { dueTasks } from './practice.js';

export function profileUpsert(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const profile = parseJsonObject(args.profile);
  const merged = { ...profile, ...args };

  return withTransaction(db, () => {
    db.prepare(`
      INSERT INTO learner_profile (
        id, initialized, name, l1, timezone, current_level, target_level,
        target_exam, exam_date, daily_minutes, preferred_tone, study_pattern,
        interests, avoid_topics, daily_english, strengths, weaknesses, notes,
        created_at, updated_at
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        initialized=MAX(learner_profile.initialized, excluded.initialized),
        name=COALESCE(NULLIF(excluded.name, ''), learner_profile.name),
        l1=COALESCE(NULLIF(excluded.l1, ''), learner_profile.l1),
        timezone=COALESCE(NULLIF(excluded.timezone, ''), learner_profile.timezone),
        current_level=COALESCE(NULLIF(excluded.current_level, ''), learner_profile.current_level),
        target_level=COALESCE(NULLIF(excluded.target_level, ''), learner_profile.target_level),
        target_exam=COALESCE(NULLIF(excluded.target_exam, ''), learner_profile.target_exam),
        exam_date=COALESCE(excluded.exam_date, learner_profile.exam_date),
        daily_minutes=CASE WHEN excluded.daily_minutes > 0 THEN excluded.daily_minutes ELSE learner_profile.daily_minutes END,
        preferred_tone=COALESCE(NULLIF(excluded.preferred_tone, ''), learner_profile.preferred_tone),
        study_pattern=COALESCE(NULLIF(excluded.study_pattern, ''), learner_profile.study_pattern),
        interests=COALESCE(NULLIF(excluded.interests, ''), learner_profile.interests),
        avoid_topics=COALESCE(NULLIF(excluded.avoid_topics, ''), learner_profile.avoid_topics),
        daily_english=COALESCE(NULLIF(excluded.daily_english, ''), learner_profile.daily_english),
        strengths=COALESCE(NULLIF(excluded.strengths, ''), learner_profile.strengths),
        weaknesses=COALESCE(NULLIF(excluded.weaknesses, ''), learner_profile.weaknesses),
        notes=COALESCE(NULLIF(excluded.notes, ''), learner_profile.notes),
        updated_at=datetime('now')
    `).run(
      Number(merged.initialized ?? 1),
      String(merged.name || ''),
      String(merged.l1 || 'zh'),
      String(merged.timezone || 'Asia/Shanghai'),
      String(merged.current_level || ''),
      String(merged.target_level || ''),
      String(merged.target_exam || 'IELTS'),
      merged.exam_date ? String(merged.exam_date) : null,
      Number(merged.daily_minutes ?? 0),
      String(merged.preferred_tone || ''),
      String(merged.study_pattern || ''),
      stringifyMaybe(merged.interests),
      stringifyMaybe(merged.avoid_topics),
      String(merged.daily_english || ''),
      String(merged.strengths || ''),
      String(merged.weaknesses || ''),
      String(merged.notes || ''),
    );
    const row = db.prepare('SELECT * FROM learner_profile WHERE id = 1').get();
    return { ok: true, action: 'profile_upsert', row };
  });
}

export function coachContext(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const days = clampInt(Number(args.days ?? 14), 1, 180);
  const wordLimit = clampInt(Number(args.limit ?? 8), 1, 20);
  const date = String(args.date || new Date().toISOString().slice(0, 10));
  const summary = studySummary(db, { days }) as Record<string, unknown>;
  const profile = db.prepare('SELECT * FROM learner_profile WHERE id = 1').get() ?? null;
  const dueWordsResult = dueWords(db, { limit: wordLimit }) as Record<string, unknown>;
  const dueTasksResult = dueTasks(db, { date }) as Record<string, unknown>;
  const recentPersonalErrors = db.prepare(`
    SELECT word, item_kind, chinese, definition, example_en, topics,
           mastery, review_count, fail_count, srs_due, origin
    FROM words
    WHERE item_kind = 'personal_error'
    ORDER BY fail_count DESC, updated_at DESC
    LIMIT 6
  `).all();

  return {
    ok: true,
    action: 'coach_context',
    days,
    date,
    profile,
    summary,
    due_words: dueWordsResult.rows ?? [],
    due_words_count: dueWordsResult.count ?? 0,
    due_tasks: dueTasksResult.rows ?? [],
    due_tasks_count: dueTasksResult.count ?? 0,
    personal_error_cards: recentPersonalErrors,
  };
}
