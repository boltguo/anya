import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from '../lib/paths.js';

let _db: DatabaseSync | null = null;

/**
 * Initialize SQLite database with required schema.
 * Creates tables if they don't exist, including FTS5 for full-text search.
 */
function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    -- Sessions table: tracks conversation sessions
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      session_key TEXT NOT NULL,
      title TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      message_count INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_key ON sessions(session_key);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

    -- Messages table: individual messages within sessions
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
  `);
}

/**
 * Get the singleton SQLite database instance.
 * Uses Node.js built-in node:sqlite (available since Node 22).
 */
export function getDb(): DatabaseSync {
  if (_db) return _db;

  // Ensure data directory exists
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  _db = new DatabaseSync(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');

  initializeSchema(_db);

  return _db;
}

/**
 * Close the database connection.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
