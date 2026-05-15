// storage/study/db.ts — connection pool for skill-owned SQLite databases (e.g. study.db)

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { STORE_DIR, SKILLS_DIR } from '../../lib/paths.js';

const dbCache = new Map<string, DatabaseSync>();

function autoInitSchema(db: DatabaseSync, dbName: string): void {
  const schemaFileName = `${dbName}.sql`;

  function scanDir(dir: string): string | null {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'templates') {
            const schemaPath = join(fullPath, schemaFileName);
            if (existsSync(schemaPath)) return schemaPath;
          }
          const found = scanDir(fullPath);
          if (found) return found;
        }
      }
    } catch { /* skip unreadable dirs */ }
    return null;
  }

  const schemaPath = scanDir(SKILLS_DIR);
  if (schemaPath) {
    const sql = readFileSync(schemaPath, 'utf-8');
    db.exec(sql);
  }
}

// Sanitizes name to prevent path traversal; auto-applies skill-owned schema on open.
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

  // Re-apply schema on open. Skill schemas are expected to be idempotent
  // (`CREATE TABLE/INDEX IF NOT EXISTS`), so additive tables and indexes are
  // picked up for existing DBs without raw SQL from skills.
  try {
    autoInitSchema(db, safeName);
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
