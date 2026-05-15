// domain/session.ts — study session lifecycle

import type { DatabaseSync } from 'node:sqlite';
import { optionalNumber, normalizeJsonString, normalizeRowId } from './helpers.js';

export function sessionStart(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const sessionKey = String(args.session_key || args.session_id || '').trim();
  const result = db.prepare(`
    INSERT INTO study_sessions (
      session_key, platform, entrypoint, status, skills_used, plan, created_at, updated_at
    ) VALUES (
      ?, ?, ?, 'active', ?, ?, datetime('now'), datetime('now')
    )
  `).run(
    sessionKey,
    String(args.platform || ''),
    String(args.entrypoint || 'manual'),
    normalizeJsonString(args.skills_used),
    normalizeJsonString(args.plan),
  );
  return {
    ok: true,
    action: 'session_start',
    study_session_id: normalizeRowId(result.lastInsertRowid),
  };
}

export function sessionEnd(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const id = optionalNumber(args.study_session_id);
  const sessionKey = String(args.session_key || args.session_id || '').trim();
  if (id === null && !sessionKey) return { error: 'Missing study_session_id or session_key' };

  const status = String(args.status || 'closed');
  const summary = String(args.summary_text || args.summary || '');
  const skillsUsed = normalizeJsonString(args.skills_used);
  const duration = optionalNumber(args.duration_seconds);
  const minutes = optionalNumber(args.minutes);

  const sampleAgg = db.prepare(`
    SELECT COUNT(*) AS samples_count, COALESCE(SUM(minutes), 0) AS minutes_total
    FROM samples
    WHERE session_id = ?
  `).get(sessionKey) as { samples_count?: number; minutes_total?: number } | undefined;

  const samplesCount = optionalNumber(args.samples_count) ?? Number(sampleAgg?.samples_count ?? 0);
  const minutesTotal = minutes ?? Number(sampleAgg?.minutes_total ?? 0);

  const sql = id !== null
    ? `
      UPDATE study_sessions
      SET ended_at = datetime('now'),
          duration_seconds = COALESCE(?, CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER)),
          status = ?,
          skills_used = CASE WHEN ? != '' THEN ? ELSE skills_used END,
          summary = ?,
          samples_count = ?,
          minutes_total = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `
    : `
      UPDATE study_sessions
      SET ended_at = datetime('now'),
          duration_seconds = COALESCE(?, CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER)),
          status = ?,
          skills_used = CASE WHEN ? != '' THEN ? ELSE skills_used END,
          summary = ?,
          samples_count = ?,
          minutes_total = ?,
          updated_at = datetime('now')
      WHERE id = (
        SELECT id FROM study_sessions
        WHERE session_key = ? AND status = 'active'
        ORDER BY started_at DESC
        LIMIT 1
      )
    `;

  const result = id !== null
    ? db.prepare(sql).run(duration, status, skillsUsed, skillsUsed, summary, samplesCount, minutesTotal, id)
    : db.prepare(sql).run(duration, status, skillsUsed, skillsUsed, summary, samplesCount, minutesTotal, sessionKey);

  return { ok: true, action: 'session_end', changes: Number(result.changes) };
}
