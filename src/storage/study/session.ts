import type { DatabaseSync } from 'node:sqlite';
import { optionalNumber, normalizeRowId } from './helpers.js';

const ACTIVE_SESSION_IDLE_HOURS = 24;

export function ensureActiveStudySession(db: DatabaseSync, sessionKey: string, _entrypoint = 'auto'): number {
  const existing = db.prepare(`
    SELECT id FROM study_sessions
    WHERE session_key = ?
      AND status = 'active'
      AND started_at >= datetime('now', ?)
    ORDER BY started_at DESC LIMIT 1
  `).get(sessionKey, `-${ACTIVE_SESSION_IDLE_HOURS} hours`) as { id?: number } | undefined;

  if (existing?.id) return existing.id;

  db.prepare(`
    UPDATE study_sessions
    SET status = 'abandoned', ended_at = datetime('now')
    WHERE session_key = ? AND status = 'active' AND started_at < datetime('now', ?)
  `).run(sessionKey, `-${ACTIVE_SESSION_IDLE_HOURS} hours`);

  const result = db.prepare(`
    INSERT INTO study_sessions (session_key, status) VALUES (?, 'active')
  `).run(sessionKey);
  return normalizeRowId(result.lastInsertRowid);
}

export function sessionStart(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const sessionKey = String(args.session_key || args.session_id || '').trim();

  // Reuse a recent active session for this key (24h window).
  const existing = db.prepare(`
    SELECT id FROM study_sessions
    WHERE session_key = ?
      AND status = 'active'
      AND started_at >= datetime('now', ?)
    ORDER BY started_at DESC LIMIT 1
  `).get(sessionKey, `-${ACTIVE_SESSION_IDLE_HOURS} hours`) as { id?: number } | undefined;

  if (existing?.id) {
    return { ok: true, action: 'session_start', study_session_id: existing.id, reused: true };
  }

  const result = db.prepare(`
    INSERT INTO study_sessions (session_key, status) VALUES (?, 'active')
  `).run(sessionKey);
  const id = normalizeRowId(result.lastInsertRowid);
  return { ok: true, action: 'session_start', study_session_id: id, reused: false };
}

export function sessionEnd(db: DatabaseSync, args: Record<string, unknown>): unknown {
  const id = optionalNumber(args.study_session_id);
  const sessionKey = String(args.session_key || args.session_id || '').trim();
  if (id === null && !sessionKey) {
    return { error: 'Missing study_session_id or session_key' };
  }

  const status = String(args.status || 'closed');

  // Resolve target row.
  const target = id !== null
    ? db.prepare(`SELECT id FROM study_sessions WHERE id = ?`).get(id) as { id?: number } | undefined
    : db.prepare(`
        SELECT id FROM study_sessions
        WHERE session_key = ? AND status = 'active'
        ORDER BY started_at DESC LIMIT 1
      `).get(sessionKey) as { id?: number } | undefined;

  if (!target?.id) {
    return { ok: false, action: 'session_end', error: 'no matching study_session row' };
  }

  const result = db.prepare(`
    UPDATE study_sessions
    SET ended_at = datetime('now'), status = ?
    WHERE id = ?
  `).run(status, target.id);

  // Derive aggregate just for the response — not stored.
  const agg = db.prepare(`
    SELECT COUNT(*) AS samples_count, COALESCE(SUM(minutes), 0) AS minutes_total
    FROM samples WHERE study_session_id = ?
  `).get(target.id) as { samples_count?: number; minutes_total?: number } | undefined;

  return {
    ok: true,
    action: 'session_end',
    study_session_id: target.id,
    samples_count: Number(agg?.samples_count ?? 0),
    minutes_total: Number(agg?.minutes_total ?? 0),
    changes: Number(result.changes),
  };
}
