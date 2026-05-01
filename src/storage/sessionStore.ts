/**
 * @module storage/sessionStore
 * @description Session and message persistence layer.
 *
 * Manages conversation sessions and their messages in SQLite. Each session
 * is identified by a `session_key` (e.g., `tg:12345` or `cli:local`) and
 * contains an ordered sequence of messages.
 *
 * All write operations use {@link withWriteRetry} to handle database-locked
 * errors that can occur when CLI and Telegram access the same DB file
 * concurrently (even with WAL mode and busy_timeout PRAGMA).
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import type { Message } from '../agent/types.js';

/** Maximum number of retry attempts for write operations. */
const MAX_WRITE_RETRIES = 3;
/** Base delay between retries (grows linearly: 200ms, 400ms, 600ms). */
const BASE_RETRY_DELAY_MS = 200;

/**
 * Execute a synchronous write operation with async retry on "database is locked".
 * Uses setTimeout-based delay to avoid blocking the Node.js event loop,
 * keeping the Telegram bot responsive during retry waits.
 */
async function withWriteRetry<T>(fn: () => T): Promise<T> {
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    try {
      return fn();
    } catch (err) {
      const isLocked = err instanceof Error && err.message.includes('database is locked');
      if (isLocked && attempt < MAX_WRITE_RETRIES - 1) {
        // Linear backoff with jitter to avoid thundering herd
        const delay = BASE_RETRY_DELAY_MS * (attempt + 1) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('withWriteRetry: unreachable');
}

/** Session metadata stored in the `sessions` table. */
export interface SessionInfo {
  id: string;
  sessionKey: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * Get or create a session for the given session key.
 * Returns the most recent active session for the key.
 */
export async function getOrCreateSession(sessionKey: string): Promise<string> {
  const db = getDb();

  // Find existing session
  const stmt = db.prepare(
    'SELECT id FROM sessions WHERE session_key = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1'
  );
  const rows = stmt.all(sessionKey) as Array<{ id: string }>;

  if (rows.length > 0) return rows[0].id;

  // Create new session
  const id = randomUUID();
  await withWriteRetry(() => {
    db.prepare(
      'INSERT INTO sessions (id, session_key, title) VALUES (?, ?, ?)'
    ).run(id, sessionKey, '');
  });

  return id;
}

/**
 * Create a new session (even if one exists for the key).
 */
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

/**
 * Load all messages for a session, in sequence order.
 */
export function loadMessages(sessionId: string): Message[] {
  const db = getDb();

  // Query sorted by updated_at DESC so we get the most recent session,
  // with rowid as tiebreaker for same-timestamp entries.
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
      content: row.content || undefined,  // Normalize null → undefined
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

/**
 * Append messages to a session inside a single transaction.
 * Ensures all INSERTs + the metadata UPDATE are atomic — a crash
 * mid-write cannot leave orphaned messages or a stale count.
 */
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

/**
 * Update the session title (auto-generated from first user message).
 */
export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await withWriteRetry(() => {
    const db = getDb();
    db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId);
  });
}

/**
 * List recent sessions.
 */
export function listSessions(limit: number = 20): SessionInfo[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT id, session_key, title, created_at, updated_at, message_count
    FROM sessions
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: string;
    session_key: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
  }>;

  return rows.map(r => ({
    id: r.id,
    sessionKey: r.session_key,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
  }));
}

/**
 * Search messages by content (simple LIKE search).
 */
export function searchMessages(query: string, limit: number = 20): Array<{
  sessionId: string;
  content: string;
}> {
  const db = getDb();

  const rows = db.prepare(`
    SELECT session_id, content
    FROM messages
    WHERE content LIKE ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(`%${query}%`, limit) as Array<{
    session_id: string;
    content: string;
  }>;

  return rows.map(r => ({
    sessionId: r.session_id,
    content: r.content,
  }));
}
