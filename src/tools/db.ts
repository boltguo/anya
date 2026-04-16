/**
 * @module tools/dbTool
 * @description Direct SQLite database tool for the agent.
 *
 * Replaces the shell → node script → sqlite roundtrip with a single
 * tool call. The agent specifies a database name and raw SQL.
 *
 * Databases live under ~/.anya/data/store/<name>.db.
 * Schema is defined in skill SKILL.md files, and the agent creates
 * tables as needed via CREATE TABLE IF NOT EXISTS.
 *
 * Security:
 *  - Only databases under STORE_DIR are accessible.
 *  - The agent cannot access arbitrary file paths.
 *  - DROP DATABASE is not possible (SQLite doesn't support it).
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { register } from './registry.js';
import { STORE_DIR, SKILLS_DIR } from '../lib/paths.js';
import type { ToolContext } from '../agent/types.js';

/** Cache of open database connections. */
const dbCache = new Map<string, DatabaseSync>();

/** SQL statement prefixes allowed for execution. */
const ALLOWED_SQL_PREFIXES = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE',
  'CREATE TABLE', 'CREATE INDEX', 'CREATE UNIQUE INDEX',
  'ALTER TABLE', 'PRAGMA', 'EXPLAIN',
  'WITH',  // CTEs that lead to SELECT/INSERT/UPDATE/DELETE
];

/** SQL statements explicitly blocked for safety. */
const BLOCKED_SQL_PATTERNS = [
  /\bDROP\s+(TABLE|INDEX|TRIGGER|VIEW)\b/i,
  /\bTRUNCATE\b/i,
  /\bATTACH\b/i,    // prevent accessing arbitrary files via ATTACH DATABASE
  /\bDETACH\b/i,
];

/**
 * Validate that a SQL statement is in the allowed whitelist.
 * Returns an error message if blocked, or null if allowed.
 */
function validateSql(sql: string): string | null {
  const trimmedUpper = sql.trimStart().toUpperCase();

  // Check blocklist first (catches e.g. DROP inside a CTE)
  for (const pattern of BLOCKED_SQL_PATTERNS) {
    if (pattern.test(sql)) {
      return `Blocked: destructive SQL statement detected (${pattern.source})`;
    }
  }

  // Check if statement starts with an allowed prefix
  const isAllowed = ALLOWED_SQL_PREFIXES.some(prefix =>
    trimmedUpper.startsWith(prefix)
  );

  if (!isAllowed) {
    return `Blocked: SQL must start with one of: ${ALLOWED_SQL_PREFIXES.join(', ')}`;
  }

  return null;
}

/**
 * Find and execute a schema .sql file for a given database name.
 * Scans all skills directories for schema/<name>.sql files.
 */
function autoInitSchema(db: DatabaseSync, dbName: string): void {
  // Scan skills directories for schema files matching this db name
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

/**
 * Get or create a database connection by name.
 * Name is sanitized to prevent path traversal.
 * Auto-initializes schema from skills/<category>/data/schema/<name>.sql on first open.
 */
function getDatabase(name: string): DatabaseSync {
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

  // Auto-init schema on first creation or if tables are empty
  if (isNew) {
    autoInitSchema(db, safeName);
  } else {
    // Check if schema exists — re-init if empty (safe due to IF NOT EXISTS)
    try {
      const tables = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table'").get() as any;
      if (tables?.c === 0) autoInitSchema(db, safeName);
    } catch { /* ignore */ }
  }

  dbCache.set(safeName, db);
  return db;
}

/** Close all cached database connections. Called on process exit. */
function closeAllDatabases(): void {
  for (const [, db] of dbCache) {
    try { db.close(); } catch { /* ignore close errors */ }
  }
  dbCache.clear();
}

// Ensure connections are closed on process exit to avoid WAL corruption
process.on('exit', closeAllDatabases);
process.on('SIGINT', () => { closeAllDatabases(); process.exit(0); });
process.on('SIGTERM', () => { closeAllDatabases(); process.exit(0); });

// ── db tool ──────────────────────────────────────────────────────────────────

register({
  name: 'db',
  description: 'Execute SQL on a named SQLite database. Database name maps to ~/.anya/data/store/<name>.db. Supports SELECT (returns rows as JSON), INSERT/UPDATE/DELETE (returns changes count), and CREATE TABLE/INDEX. Always use parameterized queries via the `params` array for safety.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Database name. Maps to <name>.db in the store directory.',
      },
      sql: {
        type: 'string',
        description: 'SQL statement to execute. Use ? placeholders for parameters.',
      },
      params: {
        type: 'string',
        description: 'JSON array of parameter values for ? placeholders. Example: \'["writing", 5]\'',
      },
    },
    required: ['name', 'sql'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const dbName = String(args.name || '').trim();
    const sql = String(args.sql || '').trim();
    const paramsRaw = args.params as string | undefined;

    if (!dbName) return JSON.stringify({ error: 'Missing database name' });
    if (!sql) return JSON.stringify({ error: 'Missing SQL statement' });

    // Validate SQL against whitelist
    const sqlError = validateSql(sql);
    if (sqlError) return JSON.stringify({ error: sqlError });

    // Parse parameters
    let params: unknown[] = [];
    if (paramsRaw) {
      try {
        params = typeof paramsRaw === 'string' ? JSON.parse(paramsRaw) : paramsRaw as unknown[];
        if (!Array.isArray(params)) params = [params];
      } catch {
        return JSON.stringify({ error: 'Invalid params JSON' });
      }
    }

    try {
      const db = getDatabase(dbName);
      const trimmedUpper = sql.trimStart().toUpperCase();

      if (trimmedUpper.startsWith('SELECT') || trimmedUpper.startsWith('PRAGMA') || trimmedUpper.startsWith('EXPLAIN')) {
        // Read query — return rows
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params as any[]);

        // Truncate if too many rows
        const MAX_ROWS = 100;
        const truncated = rows.length > MAX_ROWS;
        const result = truncated ? rows.slice(0, MAX_ROWS) : rows;

        return JSON.stringify({
          rows: result,
          count: rows.length,
          ...(truncated ? { truncated: true, total: rows.length } : {}),
        });
      } else {
        // Write query (INSERT, UPDATE, DELETE, CREATE, etc.)
        const stmt = db.prepare(sql);
        const result = stmt.run(...params as any[]);

        return JSON.stringify({
          ok: true,
          changes: result.changes,
          lastInsertRowid: typeof result.lastInsertRowid === 'bigint'
            ? Number(result.lastInsertRowid)
            : result.lastInsertRowid,
        });
      }
    } catch (err) {
      const error = err as Error;
      return JSON.stringify({ error: error.message });
    }
  },
});
