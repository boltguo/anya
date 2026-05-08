/**
 * @module domain/practice
 * @description Practice evidence logging, daily task management, and band trend tracking.
 */

import type { DatabaseSync } from 'node:sqlite';
import {
  type ErrorEntry, type SubcapEntry,
  withTransaction, optionalNumber, normalizeRowId, normalizeJsonString,
  inferSection, severityScore, parseJsonList, upsertActivity, upsertBandTrend,
} from './helpers.js';

export function logPractice(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const skillType = String(args.skill_type || '');
  const completed = Number(args.completed ?? 1);
  const prompt = String(args.prompt || (completed === 0 ? '[abandoned]' : ''));
  const response = String(args.response ?? args.raw_content ?? (completed === 0 ? '[abandoned]' : ''));
  const feedback = String(args.feedback || (completed === 0 ? 'Session abandoned before evaluation.' : ''));

  if (!skillType) return { error: 'Missing skill_type' };
  if (!prompt) return { error: 'Missing prompt' };
  if (!response) return { error: 'Missing response' };
  if (!feedback) return { error: 'Missing feedback' };

  const sessionId = String(args.session_id || '');
  const accuracy = optionalNumber(args.accuracy);
  const rawScore = optionalNumber(args.raw_score);
  const maxScore = optionalNumber(args.max_score);
  const loadScore = Number(args.load_score ?? 2);
  const audioPath = args.audio_path ? String(args.audio_path) : null;
  const imagePath = args.image_path ? String(args.image_path) : null;
  const sourceUrl = String(args.source_url || '');
  const mode = String(args.mode || 'study');
  const section = String(args.section || inferSection(skillType));
  const domain = String(args.domain || section);
  const minutes = Number(args.minutes ?? 1);
  const durationSeconds = Number(args.duration_seconds ?? minutes * 60);
  const bandOverall = optionalNumber(args.band_overall);
  const wordsReviewed = args.words_reviewed !== undefined ? Number(args.words_reviewed) : null;
  const errors = parseJsonList<ErrorEntry>(args.errors, 'errors');
  const subcaps = parseJsonList<SubcapEntry>(args.subcap_scores, 'subcap_scores');

  return withTransaction(db, () => {
    const sampleStmt = db.prepare(`
      INSERT INTO samples (
        created_at, skill_type, domain, section, prompt, response,
        accuracy, raw_score, max_score, session_id, feedback, mode, completed,
        load_score, audio_path, image_path, source_url, minutes, duration_seconds,
        band_task, band_coherence, band_lexical, band_grammar, band_pronunciation, band_overall,
        ui_feedback, translation, parent_sample_id, redo_count, prompt_hash, metadata
      ) VALUES (
        datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
    const sampleResult = sampleStmt.run(
      skillType, domain, section, prompt, response,
      accuracy, rawScore, maxScore, sessionId, feedback, mode, completed,
      loadScore, audioPath, imagePath, sourceUrl, minutes, durationSeconds,
      optionalNumber(args.band_task), optionalNumber(args.band_coherence),
      optionalNumber(args.band_lexical), optionalNumber(args.band_grammar),
      optionalNumber(args.band_pronunciation), bandOverall,
      String(args.ui_feedback || ''), String(args.translation || ''),
      optionalNumber(args.parent_sample_id), Number(args.redo_count ?? 0),
      String(args.prompt_hash || ''), normalizeJsonString(args.metadata),
    );
    const sampleId = normalizeRowId(sampleResult.lastInsertRowid);

    const errorStmt = db.prepare(`
      INSERT INTO errors (sample_id, recurrence_key, category, severity, original_phrase, correction, rule_note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const patternStmt = db.prepare(`
      INSERT INTO error_patterns (
        recurrence_key, category, severity_score, seen_count,
        last_seen_at, last_sample_id, last_original, last_correction, rule_note
      ) VALUES (?, ?, ?, 1, datetime('now'), ?, ?, ?, ?)
      ON CONFLICT(recurrence_key) DO UPDATE SET
        category = excluded.category,
        severity_score = MAX(error_patterns.severity_score, excluded.severity_score),
        seen_count = error_patterns.seen_count + 1,
        last_seen_at = excluded.last_seen_at,
        last_sample_id = excluded.last_sample_id,
        last_original = excluded.last_original,
        last_correction = excluded.last_correction,
        rule_note = excluded.rule_note
    `);
    for (const e of errors) {
      const key = String(e.key || '');
      if (!key) continue;
      const category = String(e.category || section);
      const severity = String(e.severity || 'medium');
      const original = String(e.original || '');
      const correction = String(e.correction || '');
      const note = String(e.note || '');
      errorStmt.run(sampleId, key, category, severity, original, correction, note);
      patternStmt.run(key, category, severityScore(severity), sampleId, original, correction, note);
    }

    const subcapStmt = db.prepare(`
      INSERT INTO subcap_scores (sample_id, subcap_key, score, evidence, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    for (const s of subcaps) {
      const key = String(s.key || '');
      if (!key) continue;
      subcapStmt.run(sampleId, key, Number(s.score ?? 0), String(s.evidence || ''));
    }

    upsertActivity(db, minutes, section, wordsReviewed ?? 0, 0);
    if (bandOverall !== null) upsertBandTrend(db, section, bandOverall, skillType);

    return { ok: true, action: 'practice', sample_id: sampleId, errors_count: errors.length, subcaps_count: subcaps.length };
  });
}

export function taskUpsert(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const skill = String(args.skill || args.callback || '').trim();
  if (!skill) return { error: 'Missing skill' };
  const date = String(args.date || 'now');
  const result = db.prepare(`
    INSERT INTO daily_tasks (
      date, domain, task_type, skill, mode, callback, reason, load_score, planned_minutes
    ) VALUES (
      CASE WHEN ? = 'now' THEN date('now') ELSE ? END, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    date, date,
    String(args.domain || args.section || inferSection(skill)),
    String(args.task_type || 'primary'),
    skill,
    String(args.mode || 'study'),
    String(args.callback || skill),
    String(args.reason || ''),
    Number(args.load_score ?? 0),
    Number(args.planned_minutes ?? args.minutes ?? 0),
  );
  return { ok: true, action: 'task_upsert', task_id: normalizeRowId(result.lastInsertRowid) };
}

export function dueTasks(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const date = String(args.date || 'now');
  const rows = db.prepare(`
    SELECT id, date, domain, task_type, skill, mode, callback, reason,
           planned_minutes, load_score, completed, sample_id
    FROM daily_tasks
    WHERE date = CASE WHEN ? = 'now' THEN date('now') ELSE ? END
    ORDER BY completed ASC,
      CASE task_type WHEN 'primary' THEN 1 WHEN 'review' THEN 2 WHEN 'consolidation' THEN 3 ELSE 4 END,
      id ASC
  `).all(date, date);
  return { ok: true, action: 'due_tasks', rows, count: rows.length };
}

export function taskComplete(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const taskId = optionalNumber(args.task_id);
  if (taskId === null) return { error: 'Missing task_id' };
  const result = db.prepare(`
    UPDATE daily_tasks
    SET completed = 1, completed_at = datetime('now'), sample_id = COALESCE(?, sample_id)
    WHERE id = ?
  `).run(optionalNumber(args.sample_id), taskId);
  return { ok: true, action: 'task_complete', changes: Number(result.changes) };
}
