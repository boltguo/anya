/**
 * @module lib/paths
 * @description Centralized path definitions for all Anya data directories.
 *
 * Directory structure:
 * ```
 * ~/.anya/                         (ANYA_HOME)
 * ├── config.json                  Configuration
 * ├── SOUL.md                      Agent personality
 * ├── memories/                     Identity, rules & memory
 * │   ├── SOUL.md                   Agent personality
 * │   ├── RULES.md                  Operational directives
 * │   ├── USER.md                   User profile
 * │   └── MEMORY.md                 Agent long-term notes
 * ├── skills/                      Installed skills
 * ├── data/                        All persistent data
 * │   ├── store/                   SQLite databases
 * │   │   ├── state.db             Session & message history
 * │   │   ├── vocab.db             IELTS vocabulary (skill)
 * │   │   └── learner.db           IELTS learner progress (skill)
 * │   ├── words/                   Word card JSON files (skill)
 * │   ├── learn/                   Learning session logs (skill)
 * │   ├── search/                  Web search cache
 * │   └── cache/                   General cache
 * ├── logs/                        Log files
 * ├── cron/                        Scheduled jobs
 * │   ├── jobs.json
 * │   └── history/
 * └── run/                         Runtime state (PID files)
 * ```
 *
 * Override the root with `ANYA_HOME` env var for testing.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

/**
 * ANYA_HOME — the single root folder for all user data.
 * Override with ANYA_HOME env var for testing/isolation.
 */
export const ANYA_HOME = process.env.ANYA_HOME || join(homedir(), '.anya');

// ── Configuration ────────────────────────────────────────────────────────────
export const CONFIG_PATH = join(ANYA_HOME, 'config.json');
export const CONFIG_SCHEMA_PATH = join(ANYA_HOME, 'config.schema.json');
export const AUTH_PATH = join(ANYA_HOME, 'auth.json');

// ── Identity & Memory ────────────────────────────────────────────────────────
export const MEMORY_DIR = join(ANYA_HOME, 'memories');
export const SOUL_PATH = join(MEMORY_DIR, 'SOUL.md');
export const RULES_PATH = join(MEMORY_DIR, 'RULES.md');
export const USER_MD_PATH = join(MEMORY_DIR, 'USER.md');
export const MEMORY_MD_PATH = join(MEMORY_DIR, 'MEMORY.md');

// ── Skills ───────────────────────────────────────────────────────────────────
export const SKILLS_DIR = join(ANYA_HOME, 'skills');

// ── Cron ─────────────────────────────────────────────────────────────────────
export const CRON_DIR = join(ANYA_HOME, 'cron');
export const CRON_JOBS_PATH = join(CRON_DIR, 'jobs.json');
export const CRON_HISTORY_DIR = join(CRON_DIR, 'history');

// ── Data (persistent storage) ────────────────────────────────────────────────

/** Root data directory for all persistent storage. */
export const DATA_DIR = join(ANYA_HOME, 'data');

/** SQLite database directory. All .db files live here. */
export const STORE_DIR = join(DATA_DIR, 'store');

/** Agent session & message history database. */
export const DB_PATH = join(STORE_DIR, 'state.db');

/** IELTS skill data directories (used by bundled IELTS skills). */
export const IELTS_DATA_DIR = join(DATA_DIR, 'ielts');
export const IELTS_WORDS_DIR = join(IELTS_DATA_DIR, 'words');
export const IELTS_LEARN_DIR = join(IELTS_DATA_DIR, 'learn');
export const IELTS_VOCAB_DB = join(STORE_DIR, 'vocab.db');
export const IELTS_LEARNER_DB = join(STORE_DIR, 'learner.db');

/** Web search response cache. */
export const SEARCH_CACHE_DIR = join(DATA_DIR, 'search');

/** General-purpose cache. */
export const CACHE_DIR = join(DATA_DIR, 'cache');

// ── Runtime ──────────────────────────────────────────────────────────────────
export const LOGS_DIR = join(ANYA_HOME, 'logs');
export const RUN_DIR = join(ANYA_HOME, 'run');

// ── Directory Setup ──────────────────────────────────────────────────────────

/**
 * Ensure all required directories exist.
 * Safe to call multiple times (idempotent).
 */
export function ensureDirectories(): void {
  const dirs = [
    ANYA_HOME,
    MEMORY_DIR,
    SKILLS_DIR,
    CRON_DIR,
    CRON_HISTORY_DIR,
    DATA_DIR,
    STORE_DIR,
    IELTS_DATA_DIR,
    IELTS_WORDS_DIR,
    IELTS_LEARN_DIR,
    SEARCH_CACHE_DIR,
    CACHE_DIR,
    LOGS_DIR,
    RUN_DIR,
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Check if ANYA_HOME has been initialized (config.json exists).
 */
export function isInitialized(): boolean {
  return existsSync(CONFIG_PATH);
}
