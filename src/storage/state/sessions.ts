// storage/state/sessions.ts — session and message persistence

import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import type { Message } from '../../agent/types.js';

const MAX_WRITE_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 200;

async function withWriteRetry<T>(fn: () => T): Promise<T> {
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    try {
      return fn();
    } catch (err) {
      const isLocked = err instanceof Error && err.message.includes('database is locked');
      if (isLocked && attempt < MAX_WRITE_RETRIES - 1) {
        // Linear backoff + jitter to dampen thundering herd.
        const delay = BASE_RETRY_DELAY_MS * (attempt + 1) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('withWriteRetry: unreachable');
}

export async function getOrCreateSession(sessionKey: string): Promise<string> {
  const db = getDb();

  const stmt = db.prepare(
    'SELECT id FROM sessions WHERE session_key = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1'
  );
  const rows = stmt.all(sessionKey) as Array<{ id: string }>;

  if (rows.length > 0) return rows[0].id;

  const id = randomUUID();
  await withWriteRetry(() => {
    db.prepare(
      'INSERT INTO sessions (id, session_key, title) VALUES (?, ?, ?)'
    ).run(id, sessionKey, '');
  });

  return id;
}

export async function createSession(sessionKey: string, title?: string): Promise<string> {
  const db = getDb();
  const id = randomUUID();

  await withWriteRetry(() => {
    db.prepare(
      'INSERT INTO sessions (id, session_key, title) VALUES (?, ?, ?)'
    ).run(id, sessionKey, title || '');
  });

  return id;
}

// "Start fresh" entry points (/new, /kill, nav:main, skill commands) used to
// unconditionally INSERT a new sessions row. Tapping those repeatedly without
// follow-up was leaving dozens of empty rows behind. This idempotent variant
// reuses the latest empty row when one exists; only inserts when there's a
// real session to "shed".
export async function newOrReuseEmptySession(sessionKey: string): Promise<string> {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id FROM sessions WHERE session_key = ? AND message_count = 0 ORDER BY updated_at DESC, rowid DESC LIMIT 1'
  ).all(sessionKey) as Array<{ id: string }>;
  if (rows.length > 0) {
    await withWriteRetry(() => {
      db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(rows[0].id);
    });
    return rows[0].id;
  }
  return createSession(sessionKey);
}

export function loadMessages(sessionId: string): Message[] {
  const db = getDb();

  const rows = db.prepare(
    'SELECT role, content, tool_calls, tool_call_id, tool_name, raw_parts FROM messages WHERE session_id = ? ORDER BY seq ASC'
  ).all(sessionId) as Array<{
    role: string;
    content: string | null;
    tool_calls: string | null;
    tool_call_id: string | null;
    tool_name: string | null;
    raw_parts: string | null;
  }>;

  return rows.map(row => {
    const msg: Message = {
      role: row.role as Message['role'],
      content: row.content || undefined,
    };

    if (row.tool_calls) {
      try {
        msg.toolCalls = JSON.parse(row.tool_calls);
      } catch { /* ignore parse errors */ }
    }

    if (row.raw_parts) {
      try {
        msg._rawParts = JSON.parse(row.raw_parts);
      } catch { /* ignore parse errors */ }
    }

    if (row.tool_call_id) msg.toolCallId = row.tool_call_id;
    if (row.tool_name) msg.toolName = row.tool_name;

    return msg;
  });
}

export async function saveMessages(sessionId: string, messages: Message[]): Promise<void> {
  await withWriteRetry(() => {
    const db = getDb();

    const seqRows = db.prepare(
      'SELECT COALESCE(MAX(seq), -1) as max_seq FROM messages WHERE session_id = ?'
    ).all(sessionId) as Array<{ max_seq: number }>;

    let seq = (seqRows[0]?.max_seq ?? -1) + 1;

    const insertMsg = db.prepare(`
      INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, tool_name, raw_parts, seq)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateMeta = db.prepare(`
      UPDATE sessions SET
        updated_at = datetime('now'),
        message_count = (SELECT COUNT(*) FROM messages WHERE session_id = ?)
      WHERE id = ?
    `);

    db.exec('BEGIN');
    try {
      for (const msg of messages) {
        insertMsg.run(
          sessionId,
          msg.role,
          msg.content || null,
          msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
          msg.toolCallId || null,
          msg.toolName || null,
          msg._rawParts ? JSON.stringify(msg._rawParts) : null,
          seq++
        );
      }
      updateMeta.run(sessionId, sessionId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await withWriteRetry(() => {
    const db = getDb();
    db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId);
  });
}
