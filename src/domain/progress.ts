// domain/progress.ts — progress snapshots and study summaries

import type { DatabaseSync } from 'node:sqlite';
import { optionalNumber, normalizeJsonString, clampInt } from './helpers.js';

function isoWeekRange(input: Date): { week: string; start: string; end: string } {
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = date.getUTCDay() || 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 4);
  const weekNo = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));

  return {
    week: `${year}-W${String(weekNo).padStart(2, '0')}`,
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

function dateFromIsoWeek(week: string): Date {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(week);
  if (!match) return new Date();
  const year = Number(match[1]);
  const weekNo = clampInt(Number(match[2]), 1, 53);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (weekNo - 1) * 7);
  return monday;
}

function progressPeriod(args: Record<string, unknown>): { week: string; start: string; end: string } {
  const explicitWeek = String(args.week || '').trim();
  const now = new Date();
  const target = explicitWeek ? dateFromIsoWeek(explicitWeek) : now;
  const { week, start, end } = isoWeekRange(target);
  return { week: explicitWeek || week, start, end };
}

export function studySummary(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const days = clampInt(Number(args.days ?? 14), 1, 180);
  const since = `-${days} days`;
  const samples = db.prepare(`
    SELECT section, skill_type, COUNT(*) AS n,
           ROUND(AVG(accuracy), 3) AS avg_accuracy,
           ROUND(AVG(band_overall), 2) AS avg_band
    FROM samples
    WHERE created_at >= date('now', ?)
    GROUP BY section, skill_type
    ORDER BY section, n DESC
  `).all(since);
  const bands = db.prepare(`
    SELECT section, ROUND(AVG(band_overall), 2) AS avg_band, COUNT(*) AS n
    FROM samples
    WHERE band_overall IS NOT NULL AND created_at >= date('now', ?)
    GROUP BY section
    ORDER BY section
  `).all(since);
  const errors = db.prepare(`
    SELECT recurrence_key, category, seen_count, severity_score, last_seen_at, rule_note
    FROM error_patterns
    ORDER BY (seen_count * severity_score) DESC, last_seen_at DESC
    LIMIT 12
  `).all();
  const subcaps = db.prepare(`
    SELECT subcap_key, ROUND(AVG(score), 2) AS avg_score, COUNT(*) AS n
    FROM subcap_scores
    WHERE created_at >= date('now', ?)
    GROUP BY subcap_key
    ORDER BY avg_score ASC, n DESC
    LIMIT 16
  `).all(since);
  const activity = db.prepare(`
    SELECT date, sessions_count, minutes_total, sections_touched, words_reviewed, new_words_added
    FROM activity_log
    WHERE date >= date('now', ?)
    ORDER BY date ASC
  `).all(since);
  const vocab = db.prepare(`
    SELECT mastery, COUNT(*) AS n FROM words GROUP BY mastery
  `).all();
  return { ok: true, action: 'study_summary', days, samples, bands, errors, subcaps, activity, vocab };
}

export function progressSnapshot(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const period = progressPeriod(args);

  db.prepare(`
    INSERT INTO progress_snapshots (
      week, period_start, period_end, current_level,
      listening_score, speaking_score, reading_score, writing_score,
      vocab_active_count, vocab_mature_count, total_minutes, active_days,
      sessions_count, samples_count, due_words_count, weak_subcaps, top_errors,
      notes, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')
    )
    ON CONFLICT(week) DO UPDATE SET
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      current_level = excluded.current_level,
      listening_score = excluded.listening_score,
      speaking_score = excluded.speaking_score,
      reading_score = excluded.reading_score,
      writing_score = excluded.writing_score,
      vocab_active_count = excluded.vocab_active_count,
      vocab_mature_count = excluded.vocab_mature_count,
      total_minutes = excluded.total_minutes,
      active_days = excluded.active_days,
      sessions_count = excluded.sessions_count,
      samples_count = excluded.samples_count,
      due_words_count = excluded.due_words_count,
      weak_subcaps = excluded.weak_subcaps,
      top_errors = excluded.top_errors,
      notes = excluded.notes,
      updated_at = datetime('now')
  `).run(
    period.week,
    period.start,
    period.end,
    String(args.current_level || ''),
    optionalNumber(args.listening_score),
    optionalNumber(args.speaking_score),
    optionalNumber(args.reading_score),
    optionalNumber(args.writing_score),
    Number(args.vocab_active_count ?? 0),
    Number(args.vocab_mature_count ?? 0),
    Number(args.total_minutes ?? 0),
    Number(args.active_days ?? 0),
    Number(args.sessions_count ?? 0),
    Number(args.samples_count ?? 0),
    Number(args.due_words_count ?? 0),
    normalizeJsonString(args.weak_subcaps),
    normalizeJsonString(args.top_errors),
    String(args.notes || ''),
  );

  const row = db.prepare('SELECT * FROM progress_snapshots WHERE week = ?').get(period.week);
  return { ok: true, action: 'progress_snapshot', row };
}

export function progressTrend(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const limit = clampInt(Number(args.limit ?? args.weeks ?? 8), 1, 52);
  const rows = db.prepare(`
    SELECT *
    FROM progress_snapshots
    ORDER BY period_end DESC
    LIMIT ?
  `).all(limit).reverse();
  return { ok: true, action: 'progress_trend', rows, count: rows.length };
}
