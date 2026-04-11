import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import type { Message } from '../agent/types.js';

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
export function getOrCreateSession(sessionKey: string): string {
  const db = getDb();

  // Find existing session
  const stmt = db.prepare(
    'SELECT id FROM sessions WHERE session_key = ? ORDER BY updated_at DESC LIMIT 1'
  );
  const rows = stmt.all(sessionKey) as Array<{ id: string }>;

  if (rows.length > 0) return rows[0].id;

  // Create new session
  const id = randomUUID();
  db.prepare(
    'INSERT INTO sessions (id, session_key, title) VALUES (?, ?, ?)'
  ).run(id, sessionKey, '');

  return id;
}

/**
 * Create a new session (even if one exists for the key).
 */
export function createSession(sessionKey: string, title?: string): string {
  const db = getDb();
  const id = randomUUID();

  db.prepare(
    'INSERT INTO sessions (id, session_key, title) VALUES (?, ?, ?)'
  ).run(id, sessionKey, title || '');

  return id;
}

/**
 * Load all messages for a session, in sequence order.
 */
export function loadMessages(sessionId: string): Message[] {
  const db = getDb();

  const rows = db.prepare(
    'SELECT role, content, tool_calls, tool_call_id, tool_name FROM messages WHERE session_id = ? ORDER BY seq ASC'
  ).all(sessionId) as Array<{
    role: string;
    content: string | null;
    tool_calls: string | null;
    tool_call_id: string | null;
    tool_name: string | null;
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

    if (row.tool_call_id) msg.toolCallId = row.tool_call_id;
    if (row.tool_name) msg.toolName = row.tool_name;

    return msg;
  });
}

/**
 * Append messages to a session.
 * Updates the session's updated_at and message_count.
 */
export function saveMessages(sessionId: string, messages: Message[]): void {
  const db = getDb();

  // Get current max seq
  const seqRows = db.prepare(
    'SELECT COALESCE(MAX(seq), -1) as max_seq FROM messages WHERE session_id = ?'
  ).all(sessionId) as Array<{ max_seq: number }>;

  let seq = (seqRows[0]?.max_seq ?? -1) + 1;

  const insertMsg = db.prepare(`
    INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, tool_name, seq)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const msg of messages) {
    insertMsg.run(
      sessionId,
      msg.role,
      msg.content || null,
      msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
      msg.toolCallId || null,
      msg.toolName || null,
      seq++
    );
  }

  // Update session metadata
  db.prepare(`
    UPDATE sessions SET
      updated_at = datetime('now'),
      message_count = (SELECT COUNT(*) FROM messages WHERE session_id = ?)
    WHERE id = ?
  `).run(sessionId, sessionId);
}

/**
 * Update the session title (auto-generated from first user message).
 */
export function updateSessionTitle(sessionId: string, title: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId);
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
 * FTS5 can be added later when node:sqlite stabilizes.
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
