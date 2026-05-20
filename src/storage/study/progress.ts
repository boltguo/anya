// storage/study/progress.ts — study summary, learner state, weekly snapshots
//
// schema v3: band_trend and activity_log tables were dropped. All time-series
// data is derived from `samples` and `subcap_scores` at read time. The single
// row of cached state — progress_snapshots — now only carries the four section
// scores + level + notes; vocab counts / minutes / sessions / weak_subcaps /
// top_errors all derive on demand.

import type { DatabaseSync } from 'node:sqlite';
import { optionalNumber, clampInt } from './helpers.js';

// ─── ISO week helpers ─────────────────────────────────────────────────────

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

// ─── Study summary (all read-derived) ─────────────────────────────────────

export function studySummary(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const days = clampInt(Number(args.days ?? 14), 1, 180);
  const since = `-${days} days`;

  const samples = db.prepare(`
    SELECT section, skill_type, COUNT(*) AS n,
           ROUND(AVG(accuracy), 3) AS avg_accuracy,
           ROUND(AVG(band_overall), 2) AS avg_band
    FROM samples
    WHERE created_at >= datetime('now', ?) AND completed = 1
    GROUP BY section, skill_type
    ORDER BY section, n DESC
  `).all(since);

  const bands = db.prepare(`
    SELECT section, ROUND(AVG(band_overall), 2) AS avg_band, COUNT(*) AS n
    FROM samples
    WHERE band_overall IS NOT NULL AND created_at >= datetime('now', ?) AND completed = 1
    GROUP BY section
    ORDER BY section
  `).all(since);

  // Errors: joined with the last sample's evidence so error-clinic can show
  // "原句 → 修正" without a separate cache table.
  const errors = db.prepare(`
    SELECT ep.recurrence_key, ep.category, ep.seen_count, ep.severity_score,
           ep.last_seen_at, ep.rule_note,
           (
             SELECT COUNT(*) FROM errors e2
             WHERE e2.recurrence_key = ep.recurrence_key
               AND e2.created_at >= datetime('now','-30 days')
           ) AS last_30d_count,
           (
             SELECT json_object(
               'original', e.original_phrase,
               'correction', e.correction,
               'sample_id', e.sample_id,
               'at', e.created_at
             )
             FROM errors e
             WHERE e.recurrence_key = ep.recurrence_key
             ORDER BY e.created_at DESC LIMIT 1
           ) AS last_example
    FROM error_patterns ep
    ORDER BY (
      (SELECT COUNT(*) FROM errors e2 WHERE e2.recurrence_key = ep.recurrence_key
        AND e2.created_at >= datetime('now','-30 days'))
      * ep.severity_score
    ) DESC, ep.last_seen_at DESC
    LIMIT 12
  `).all().map((row) => {
    const r = row as Record<string, unknown>;
    let example: unknown = null;
    try { example = r.last_example ? JSON.parse(String(r.last_example)) : null; }
    catch { example = null; }
    return { ...r, last_example: example };
  });

  // Subcaps: native 0-10 average, plus an "unaided" variant that excludes
  // samples written with any scaffold (assistance_level != 'none').
  const subcaps = db.prepare(`
    SELECT s.subcap_key,
           ROUND(AVG(s.value), 2) AS avg_value,
           ROUND(AVG(CASE WHEN samp.assistance_level = 'none' THEN s.value END), 2) AS avg_unaided,
           COUNT(*) AS n
    FROM subcap_scores s
    INNER JOIN samples samp ON samp.id = s.sample_id
    WHERE s.created_at >= datetime('now', ?) AND samp.completed = 1
    GROUP BY s.subcap_key
    ORDER BY avg_value ASC, n DESC
    LIMIT 16
  `).all(since);

  // Activity: derived from samples + study_sessions.
  const activity = db.prepare(`
    SELECT date(created_at) AS date,
           COUNT(*) AS samples_count,
           SUM(minutes) AS minutes_total,
           GROUP_CONCAT(DISTINCT section) AS sections_touched
    FROM samples
    WHERE created_at >= date('now', ?) AND completed = 1
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(since);

  const sessions = db.prepare(`
    SELECT date(started_at) AS date, COUNT(*) AS sessions_count
    FROM study_sessions
    WHERE started_at >= date('now', ?)
    GROUP BY date(started_at)
  `).all(since) as Array<{ date: string; sessions_count: number }>;

  const sessionMap = new Map(sessions.map((s) => [s.date, s.sessions_count]));
  const activityEnriched = activity.map((row) => {
    const r = row as Record<string, unknown>;
    return { ...r, sessions_count: sessionMap.get(String(r.date)) ?? 0 };
  });

  const vocab = db.prepare(`
    SELECT mastery, COUNT(*) AS n FROM words GROUP BY mastery
  `).all();

  return {
    ok: true, action: 'study_summary', days,
    samples, bands, errors, subcaps,
    activity: activityEnriched,
    vocab,
  };
}

// ─── Learner-state EMA (server-computed) ──────────────────────────────────

interface EmaInput {
  current: number | null;
  count: number;
  previous: number | null;
}

function computeEma({ current, count, previous }: EmaInput): number | null {
  if (current === null && previous === null) return null;
  if (current === null) return previous;
  if (previous === null) return current;
  const alpha = Math.min(0.6, count / 10);
  return Math.round((alpha * current + (1 - alpha) * previous) * 10) / 10;
}

export function learnerStateScores(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const days = clampInt(Number(args.days ?? 14), 1, 180);
  const since = `-${days} days`;

  // Per-section normalized average derived from subcap_scores. Subcap values
  // are on a 0-10 scale; we multiply by 10 to express on 0-100.
  const sectionRows = db.prepare(`
    SELECT
      CASE
        WHEN s.subcap_key LIKE 'listening.%' THEN 'listening'
        WHEN s.subcap_key LIKE 'speaking.%'  THEN 'speaking'
        WHEN s.subcap_key LIKE 'reading.%'   THEN 'reading'
        WHEN s.subcap_key LIKE 'writing.%'   THEN 'writing'
        WHEN s.subcap_key LIKE 'vocab.%'     THEN 'vocab'
        ELSE 'other'
      END AS section,
      ROUND(AVG(s.value) * 10, 1) AS avg_normalized,
      ROUND(AVG(CASE WHEN samp.assistance_level = 'none' THEN s.value END) * 10, 1) AS avg_unaided,
      COUNT(*) AS n
    FROM subcap_scores s
    INNER JOIN samples samp ON samp.id = s.sample_id
    WHERE s.created_at >= datetime('now', ?) AND samp.completed = 1
    GROUP BY section
  `).all(since) as Array<{ section: string; avg_normalized?: number; avg_unaided?: number; n?: number }>;

  const prev = db.prepare(`
    SELECT listening_score, speaking_score, reading_score, writing_score
    FROM progress_snapshots
    ORDER BY period_end DESC LIMIT 1
  `).get() as
    | { listening_score?: number; speaking_score?: number; reading_score?: number; writing_score?: number }
    | undefined;

  const scoreFor = (section: string) => {
    const row = sectionRows.find((r) => r.section === section);
    const current = optionalNumber(row?.avg_unaided ?? row?.avg_normalized);
    const n = Number(row?.n ?? 0);
    const previous = optionalNumber(
      section === 'listening' ? prev?.listening_score :
      section === 'speaking'  ? prev?.speaking_score :
      section === 'reading'   ? prev?.reading_score :
      section === 'writing'   ? prev?.writing_score : null
    );
    return { ema: computeEma({ current, count: n, previous }), current, n };
  };

  const listening = scoreFor('listening');
  const speaking = scoreFor('speaking');
  const reading = scoreFor('reading');
  const writing = scoreFor('writing');

  const counts = [listening.n, speaking.n, reading.n, writing.n];
  const minN = Math.min(...counts);
  const confidence = minN >= 10 ? 'high' : minN >= 5 ? 'medium' : 'low';

  return {
    ok: true,
    action: 'learner_state_scores',
    days,
    scores: {
      listening: listening.ema,
      speaking:  speaking.ema,
      reading:   reading.ema,
      writing:   writing.ema,
    },
    raw_current: {
      listening: listening.current,
      speaking:  speaking.current,
      reading:   reading.current,
      writing:   writing.current,
    },
    sample_counts: {
      listening: listening.n,
      speaking:  speaking.n,
      reading:   reading.n,
      writing:   writing.n,
    },
    confidence,
    previous: prev ?? null,
  };
}

// ─── Progress snapshots (slim: 4 scores + level + notes) ──────────────────

export function progressSnapshot(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const period = progressPeriod(args);

  let scores: Record<string, number | null> = {
    listening_score: optionalNumber(args.listening_score),
    speaking_score:  optionalNumber(args.speaking_score),
    reading_score:   optionalNumber(args.reading_score),
    writing_score:   optionalNumber(args.writing_score),
  };
  const allMissing = Object.values(scores).every((v) => v === null);
  if (allMissing) {
    const ema = learnerStateScores(db, { days: 14 }) as { scores?: Record<string, number | null> };
    scores = {
      listening_score: ema.scores?.listening ?? null,
      speaking_score:  ema.scores?.speaking ?? null,
      reading_score:   ema.scores?.reading ?? null,
      writing_score:   ema.scores?.writing ?? null,
    };
  }

  db.prepare(`
    INSERT INTO progress_snapshots (
      week, period_start, period_end, current_level,
      listening_score, speaking_score, reading_score, writing_score,
      notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(week) DO UPDATE SET
      period_start    = excluded.period_start,
      period_end      = excluded.period_end,
      current_level   = excluded.current_level,
      listening_score = excluded.listening_score,
      speaking_score  = excluded.speaking_score,
      reading_score   = excluded.reading_score,
      writing_score   = excluded.writing_score,
      notes           = excluded.notes,
      updated_at      = datetime('now')
  `).run(
    period.week, period.start, period.end,
    String(args.current_level || ''),
    scores.listening_score, scores.speaking_score, scores.reading_score, scores.writing_score,
    String(args.notes || ''),
  );

  const row = db.prepare('SELECT * FROM progress_snapshots WHERE week = ?').get(period.week);
  return { ok: true, action: 'progress_snapshot', row };
}

export function progressTrend(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const limit = clampInt(Number(args.limit ?? args.weeks ?? 8), 1, 52);
  const rows = db.prepare(`
    SELECT * FROM progress_snapshots
    ORDER BY period_end DESC LIMIT ?
  `).all(limit).reverse();
  return { ok: true, action: 'progress_trend', rows, count: rows.length };
}
