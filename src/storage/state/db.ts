// storage/state/db.ts — state.db connection (agent sessions + messages + usage)

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_PATH } from '../../lib/paths.js';

let _db: DatabaseSync | null = null;

// Schema lives alongside this module in src/; postbuild.cjs copies it to
// dist/storage/state/state.sql. tsup bundles into dist/index.js or
// dist/bin/anya.js, so `import.meta.url` may land at either — try all three.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function applySchema(db: DatabaseSync): void {
  const candidates = [
    join(MODULE_DIR, 'state.sql'),                            // dev (tsx): src/storage/state/state.sql
    join(MODULE_DIR, 'storage', 'state', 'state.sql'),        // prod, bundled into dist/index.js
    join(MODULE_DIR, '..', 'storage', 'state', 'state.sql'),  // prod, bundled into dist/bin/anya.js
  ];
  const schemaPath = candidates.find(existsSync);
  if (!schemaPath) throw new Error('state.sql not found in any candidate location');
  db.exec(readFileSync(schemaPath, 'utf-8'));
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

  applySchema(_db);

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
