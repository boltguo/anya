/**
 * @module storage/db
 * @description Provides a singleton SQLite database connection using Node.js built-in `node:sqlite`.
 *
 * This module manages the lifecycle of the database connection for the agent,
 * utilizing Write-Ahead Logging (WAL) for improved concurrent read performance,
 * and handles automatic schema initialization.
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from '../lib/paths.js';

/**
 * Singleton database instance.
 * Lazily initialized upon the first invocation of {@link getDb}.
 * @type {DatabaseSync | null}
 */
let _db: DatabaseSync | null = null;

/**
 * Initializes the SQLite database with the required schema.
 * Executes DDL statements to create tables and indexes if they do not already exist.
 *
 * @param {DatabaseSync} db - The active SQLite database connection instance.
 * @returns {void}
 */
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

  // Migration: add active_skill column to existing databases
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN active_skill TEXT DEFAULT NULL');
  } catch {
    // Column already exists — ignore
  }

  // Note: raw_parts column stores serialized rawModelParts from the LLM
  // response. Used to preserve provider-specific output for replay fidelity.
  // Written by sessionStore.saveMessages() when msg._rawParts is present.
}

/**
 * Retrieves the singleton SQLite database instance.
 * If the instance does not exist, it creates the required directories,
 * initializes the connection, configures PRAGMAs (WAL, busy_timeout),
 * and sets up the schema.
 *
 * @returns {DatabaseSync} The initialized and ready-to-use database connection.
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
  // (Multiple processes may share the same DB file).
  _db.exec('PRAGMA busy_timeout = 5000');

  initializeSchema(_db);

  return _db;
}

/**
 * Closes the active database connection if it exists and resets the singleton instance.
 *
 * @returns {void}
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
