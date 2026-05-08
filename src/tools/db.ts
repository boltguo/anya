/**
 * @module tools/dbTool
 * @description Direct SQLite database tool for the agent.
 *
 * Provides direct SQLite access through a constrained tool call. The agent
 * specifies a database name and raw SQL.
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
 * Validates a raw SQL string against a security heuristics whitelist and blacklist.
 * Ensures the agent cannot execute fundamentally destructive or out-of-bounds commands.
 *
 * @param sql - The raw SQL string intended for execution.
 * @returns A string containing the error message if the query is blocked, or null if permitted.
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

function isReadOnlySql(sql: string): boolean {
  const trimmedUpper = sql.trimStart().toUpperCase();
  return trimmedUpper.startsWith('SELECT')
    || trimmedUpper.startsWith('PRAGMA')
    || trimmedUpper.startsWith('EXPLAIN');
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

/**
 * Return a compact schema dump for an entire database.
 * One entry per table with columns and indexes — used for zero-shot discovery
 * and for augmenting failed-query errors with relevant context.
 */
function dumpSchema(db: DatabaseSync, onlyTables?: string[]): unknown {
  const tables = db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as Array<{ name: string; sql: string }>;

  const filter = onlyTables && onlyTables.length > 0
    ? new Set(onlyTables.map(t => t.toLowerCase()))
    : null;

  return tables
    .filter(t => !filter || filter.has(t.name.toLowerCase()))
    .map(t => {
      const columns = db.prepare(`PRAGMA table_info(${t.name})`).all() as Array<{
        name: string; type: string; notnull: number; dflt_value: unknown; pk: number;
      }>;
      return {
        table: t.name,
        columns: columns.map(c => ({
          name: c.name,
          type: c.type,
          notnull: c.notnull === 1,
          default: c.dflt_value,
          pk: c.pk === 1,
        })),
      };
    });
}

/** Extract bare table identifiers from a SQL string (best-effort regex). */
function extractTableNames(sql: string): string[] {
  const found = new Set<string>();
  const re = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) found.add(m[1]);
  return [...found];
}

register({
  name: 'db',
  description: 'Execute SQL on a named SQLite database (~/.anya/data/store/<name>.db). Two modes: (1) Single: pass `sql` + optional `params`. (2) Batch: pass `queries` — a JSON array of {sql, params?} objects executed atomically in one transaction. In batch mode, use last_insert_rowid() in subsequent statements to reference IDs from earlier INSERTs (e.g. INSERT into samples, then INSERT into errors with last_insert_rowid()). Omit both `sql` and `queries` to get the full schema dump. Always use ? placeholders + `params` for values — never string-concat.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Database name (e.g. "study"). Maps to <name>.db in the store directory.',
      },
      sql: {
        type: 'string',
        description: 'Single SQL statement. Use ? placeholders for values.',
      },
      params: {
        type: 'string',
        description: 'JSON-stringified array of values for ? placeholders in single-statement mode.',
      },
      queries: {
        type: 'string',
        description: 'Batch mode: JSON array of {sql, params?} objects. Executed sequentially in one transaction. Use last_insert_rowid() to chain INSERTs. Example: \'[{"sql":"INSERT INTO samples (...) VALUES (...)"},{"sql":"INSERT INTO errors (...) VALUES (last_insert_rowid(), ...)"}]\'',
      },
    },
    required: ['name'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const dbName = String(args.name || '').trim();
    const sql = String(args.sql || '').trim();
    const paramsRaw = args.params;
    const queriesRaw = args.queries;

    if (!dbName) return JSON.stringify({ error: 'Missing database name' });

    // ── Batch mode: queries parameter ──
    if (queriesRaw) {
      let queries: Array<{ sql: string; params?: unknown[] | string }>;
      try {
        queries = typeof queriesRaw === 'string' ? JSON.parse(queriesRaw) : queriesRaw as any;
        if (!Array.isArray(queries)) return JSON.stringify({ error: 'queries must be a JSON array' });
      } catch {
        return JSON.stringify({ error: 'Invalid queries JSON — must be a JSON array of {sql, params?} objects' });
      }

      // Validate all statements before executing any
      for (const q of queries) {
        if (!q.sql || typeof q.sql !== 'string') {
          return JSON.stringify({ error: 'Each query must have a "sql" string property' });
        }
        const err = validateSql(q.sql);
        if (err) return JSON.stringify({ error: `Query "${q.sql.substring(0, 60)}...": ${err}` });
        if (dbName === 'study' && !isReadOnlySql(q.sql)) {
          return JSON.stringify({ error: 'study.db writes are blocked in db tool. Use persist action=practice, word_upsert, word_review, profile_upsert, task_upsert, task_complete, or another typed persist action.' });
        }
      }

      let db: DatabaseSync;
      try {
        db = getDatabase(dbName);
      } catch (err) {
        return JSON.stringify({ error: (err as Error).message });
      }

      const results: Array<{ ok?: boolean; changes?: number; lastInsertRowid?: number; rows?: unknown[]; count?: number }> = [];
      try {
        db.exec('BEGIN');
        for (const q of queries) {
          try {
            let params: unknown[] = [];
            if (q.params) {
              params = typeof q.params === 'string' ? JSON.parse(q.params as string) : q.params;
              if (!Array.isArray(params)) params = [params];
            }

            const trimmedUpper = q.sql.trimStart().toUpperCase();
            if (trimmedUpper.startsWith('SELECT') || trimmedUpper.startsWith('PRAGMA') || trimmedUpper.startsWith('EXPLAIN') || trimmedUpper.startsWith('WITH')) {
              const stmt = db.prepare(q.sql);
              const rows = stmt.all(...params as any[]);
              results.push({ rows: rows.slice(0, 50), count: rows.length });
            } else {
              const stmt = db.prepare(q.sql);
              const result = stmt.run(...params as any[]);
              results.push({
                ok: true,
                changes: Number(result.changes),
                lastInsertRowid: typeof result.lastInsertRowid === 'bigint'
                  ? Number(result.lastInsertRowid)
                  : result.lastInsertRowid as number,
              });
            }
          } catch (err) {
            db.exec('ROLLBACK');
            let schemaHint: unknown;
            try { schemaHint = dumpSchema(db, extractTableNames(q.sql)); } catch { /* ignore */ }
            return JSON.stringify({
              error: `Query ${results.length + 1} failed: ${(err as Error).message}`,
              failedSql: q.sql.substring(0, 200),
              completedCount: results.length,
              ...(schemaHint && Array.isArray(schemaHint) && schemaHint.length > 0 ? { schema: schemaHint } : {}),
            });
          }
        }
        db.exec('COMMIT');
        return JSON.stringify({ ok: true, batch: results.length, results });
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch { /* ignore */ }
        return JSON.stringify({ error: (err as Error).message });
      }
    }

    // ── Schema-discovery mode: no SQL → return the full schema for this db. ──
    if (!sql) {
      try {
        const db = getDatabase(dbName);
        return JSON.stringify({ schema: dumpSchema(db) });
      } catch (err) {
        return JSON.stringify({ error: (err as Error).message });
      }
    }

    // ── Single-statement mode ──
    const sqlError = validateSql(sql);
    if (sqlError) return JSON.stringify({ error: sqlError });
    if (dbName === 'study' && !isReadOnlySql(sql)) {
      return JSON.stringify({ error: 'study.db writes are blocked in db tool. Use persist action=practice, word_upsert, word_review, profile_upsert, task_upsert, task_complete, or another typed persist action.' });
    }

    let params: unknown[] = [];
    if (paramsRaw !== undefined && paramsRaw !== null && paramsRaw !== '') {
      try {
        params = typeof paramsRaw === 'string' ? JSON.parse(paramsRaw) : paramsRaw as unknown[];
        if (!Array.isArray(params)) params = [params];
      } catch {
        return JSON.stringify({ error: 'Invalid params JSON — must be a JSON-stringified array, e.g. \'["a", 2]\'' });
      }
    }

    let db: DatabaseSync;
    try {
      db = getDatabase(dbName);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }

    try {
      const trimmedUpper = sql.trimStart().toUpperCase();

      if (trimmedUpper.startsWith('SELECT') || trimmedUpper.startsWith('PRAGMA') || trimmedUpper.startsWith('EXPLAIN') || trimmedUpper.startsWith('WITH')) {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params as any[]);
        const MAX_ROWS = 100;
        const truncated = rows.length > MAX_ROWS;
        const result = truncated ? rows.slice(0, MAX_ROWS) : rows;
        return JSON.stringify({
          rows: result,
          count: rows.length,
          ...(truncated ? { truncated: true, total: rows.length } : {}),
        });
      }

      const stmt = db.prepare(sql);
      const result = stmt.run(...params as any[]);
      return JSON.stringify({
        ok: true,
        changes: result.changes,
        lastInsertRowid: typeof result.lastInsertRowid === 'bigint'
          ? Number(result.lastInsertRowid)
          : result.lastInsertRowid,
      });
    } catch (err) {
      const message = (err as Error).message;
      let schemaHint: unknown;
      try { schemaHint = dumpSchema(db, extractTableNames(sql)); } catch { /* ignore */ }
      return JSON.stringify({
        error: message,
        ...(schemaHint && Array.isArray(schemaHint) && schemaHint.length > 0 ? { schema: schemaHint } : {}),
      });
    }
  },
});
