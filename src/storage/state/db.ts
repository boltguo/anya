// storage/state/db.ts — state.db connection (agent sessions + messages)

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from '../../lib/paths.js';

let _db: DatabaseSync | null = null;

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    -- Sessions table: tracks conversation sessions
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      session_key TEXT NOT NULL,
      title TEXT DEFAULT '',
      active_skill TEXT DEFAULT NULL,
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
      raw_parts TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
  `);

  // Migration for pre-active_skill databases.
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN active_skill TEXT DEFAULT NULL');
  } catch {
    // column already exists
  }
}

export function getDb(): DatabaseSync {
  if (_db) return _db;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  _db = new DatabaseSync(DB_PATH);

  // WAL improves concurrent read performance.
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  // Multiple processes may share the DB file; wait up to 5s for the write lock.
  _db.exec('PRAGMA busy_timeout = 5000');

  initializeSchema(_db);

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
