// storage/study/db.ts — connection pool for agent-owned SQLite databases (e.g. study.db)

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORE_DIR } from '../../lib/paths.js';

const dbCache = new Map<string, DatabaseSync>();

// Schemas (study.sql, …) ship alongside this module in src/, and postbuild.cjs
// copies them to dist/storage/study/. tsup bundles into dist/index.js, so
// `import.meta.url` resolves to dist/ in prod — try both layouts.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function applySchema(db: DatabaseSync, dbName: string): void {
  const candidates = [
    join(MODULE_DIR, `${dbName}.sql`),                              // dev (tsx): src/storage/study/<name>.sql
    join(MODULE_DIR, 'storage', 'study', `${dbName}.sql`),          // prod, bundled into dist/index.js
    join(MODULE_DIR, '..', 'storage', 'study', `${dbName}.sql`),    // prod, bundled into dist/bin/anya.js
  ];
  const schemaPath = candidates.find(existsSync);
  if (!schemaPath) return;
  db.exec(readFileSync(schemaPath, 'utf-8'));
}

// Sanitizes name to prevent path traversal; auto-applies the matching schema on open.
export function getDatabase(name: string): DatabaseSync {
  const safeName = basename(name).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeName) throw new Error('Invalid database name');

  if (dbCache.has(safeName)) return dbCache.get(safeName)!;

  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }

  const dbPath = join(STORE_DIR, `${safeName}.db`);
  const isNew = !existsSync(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  // Schemas are idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`), so additive
  // tables and indexes are picked up for existing DBs on every open.
  try {
    applySchema(db, safeName);
  } catch {
    if (isNew) throw new Error(`Failed to initialize schema for ${safeName}`);
  }

  dbCache.set(safeName, db);
  return db;
}

function closeAllDatabases(): void {
  for (const [, db] of dbCache) {
    try { db.close(); } catch { /* ignore close errors */ }
  }
  dbCache.clear();
}

// Close connections on exit to avoid WAL corruption.
process.on('exit', closeAllDatabases);
process.on('SIGINT', () => { closeAllDatabases(); process.exit(0); });
process.on('SIGTERM', () => { closeAllDatabases(); process.exit(0); });
