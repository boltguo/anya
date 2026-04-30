/**
 * @module storage/db
 * @description SQLite database singleton using Node.js built-in `node:sqlite`.
 *
 * Provides a single shared {@link DatabaseSync} instance for the entire process.
 * Uses WAL (Write-Ahead Logging) for concurrent read access from CLI, Telegram,
 * and cron processes, plus a 5-second busy_timeout to handle write contention.
 *
 * Schema is auto-created on first access via {@link initializeSchema}.
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from '../lib/paths.js';

/** Singleton database instance. Lazily initialized on first `getDb()` call. */
let _db: DatabaseSync | null = null;

/**
 * Initialize SQLite database with required schema.
 * Creates tables if they don't exist.
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
      raw_parts TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
  `);

  // Migration: add raw_parts column if it doesn't exist
  try {
    db.exec('ALTER TABLE messages ADD COLUMN raw_parts TEXT;');
  } catch {
    // Ignore error if column already exists
  }
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
  // Wait up to 5 s when another connection holds the write lock
  // (CLI + Telegram + cron may share the same DB file).
  _db.exec('PRAGMA busy_timeout = 5000');

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
