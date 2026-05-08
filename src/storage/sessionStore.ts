/**
 * @module storage/sessionStore
 * @description Provides a persistent storage layer for conversational sessions and messages.
 *
 * This module wraps the base database abstraction to handle the specific domain
 * of multi-turn interactions. It ensures safe concurrent writes via retry mechanisms
 * and manages the lifecycle of `sessions` and their associated `messages`.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import type { Message } from '../agent/types.js';

/**
 * The maximum number of attempts to retry a write operation when the database is locked.
 * @constant {number}
 */
const MAX_WRITE_RETRIES = 3;

/**
 * The base delay in milliseconds used for linear backoff calculation during write retries.
 * @constant {number}
 */
const BASE_RETRY_DELAY_MS = 200;

/**
 * Executes a synchronous database write operation with an asynchronous retry mechanism.
 * Specifically handles `database is locked` errors by applying a linear backoff with jitter
 * to prevent blocking the event loop and mitigating thundering herd effects.
 *
 * @template T
 * @param {() => T} fn - A closure representing the synchronous database operation to execute.
 * @returns {Promise<T>} A promise that resolves with the result of the operation.
 * @throws {Error} Rethrows the error if it is not a lock error or if the maximum retries are exhausted.
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

/**
 * Represents the metadata of a conversational session.
 * @interface SessionInfo
 */
export interface SessionInfo {
  /** The unique identifier (UUID) of the session. */
  id: string;
  /** The external identifier key (e.g., Telegram user ID). */
  sessionKey: string;
  /** A human-readable title summarizing the session content. */
  title: string;
  /** The ISO string timestamp of when the session was created. */
  createdAt: string;
  /** The ISO string timestamp of the last update to the session. */
  updatedAt: string;
  /** The total number of messages recorded within this session. */
  messageCount: number;
}

/**
 * Retrieves the most recent active session ID for a given key, or creates a new one if none exists.
 *
 * @param {string} sessionKey - The identifying key for the user or context (e.g., `tg:12345`).
 * @returns {Promise<string>} The internal UUID of the resolved or newly created session.
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
 * Forcibly creates a new session for the given key, disregarding any existing active sessions.
 *
 * @param {string} sessionKey - The identifying key for the user or context.
 * @param {string} [title] - An optional initial title for the session.
 * @returns {Promise<string>} The internal UUID of the newly created session.
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
 * Loads the complete message history for a given session, ordered chronologically by sequence.
 * Restores complex payload properties like `toolCalls` and `_rawParts` from JSON.
 *
 * @param {string} sessionId - The internal UUID of the session to retrieve.
 * @returns {Message[]} An array of message objects reflecting the conversation history.
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
 * Appends an array of messages to a session in an atomic database transaction.
 * Ensures the session's updated timestamp and message count accurately reflect the new state.
 *
 * @param {string} sessionId - The internal UUID of the target session.
 * @param {Message[]} messages - An array of messages to append.
 * @returns {Promise<void>} Resolves when the transaction is successfully committed.
 * @throws {Error} Throws if the transaction fails and is rolled back.
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
 * Updates the title of an existing session. Usually inferred from the user's initial interaction.
 *
 * @param {string} sessionId - The internal UUID of the session to modify.
 * @param {string} title - The new title to assign.
 * @returns {Promise<void>} Resolves when the update is successful.
 */
export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await withWriteRetry(() => {
    const db = getDb();
    db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId);
  });
}

/**
 * Retrieves a paginated list of recent sessions, ordered by their last update time.
 *
 * @param {number} [limit=20] - The maximum number of sessions to retrieve.
 * @returns {SessionInfo[]} An array of metadata describing the most recent sessions.
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
 * Performs a simple text search across all message contents within the database.
 *
 * @param {string} query - The substring to search for within message contents.
 * @param {number} [limit=20] - The maximum number of matching messages to return.
 * @returns {Array<{ sessionId: string; content: string }>} An array of objects containing the matched content and its associated session ID.
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
