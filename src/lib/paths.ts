import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

/**
 * VELA_HOME -- the single folder for all user data.
 * Override with VELA_HOME env var for testing.
 */
export const VELA_HOME = process.env.VELA_HOME || join(homedir(), '.vela');

// --- Soul Layer (must migrate) ---
export const CONFIG_PATH = join(VELA_HOME, 'config.json');
export const CONFIG_SCHEMA_PATH = join(VELA_HOME, 'config.schema.json');
export const MEMORY_DIR = join(VELA_HOME, 'memory');
export const USER_MD_PATH = join(MEMORY_DIR, 'USER.md');
export const MEMORY_MD_PATH = join(MEMORY_DIR, 'MEMORY.md');
export const SKILLS_DIR = join(VELA_HOME, 'skills');
export const CRON_DIR = join(VELA_HOME, 'cron');
export const CRON_JOBS_PATH = join(CRON_DIR, 'jobs.json');

// --- Environment Layer (can discard) ---
export const DATA_DIR = join(VELA_HOME, 'data');
export const DB_PATH = join(DATA_DIR, 'state.db');
export const SEARCH_CACHE_DIR = join(DATA_DIR, 'search');
export const CACHE_DIR = join(DATA_DIR, 'cache');
export const LOGS_DIR = join(VELA_HOME, 'logs');
export const RUN_DIR = join(VELA_HOME, 'run');
export const CRON_HISTORY_DIR = join(CRON_DIR, 'history');

/**
 * Ensure all required directories exist.
 * Safe to call multiple times (idempotent).
 */
export function ensureDirectories(): void {
  const dirs = [
    VELA_HOME,
    MEMORY_DIR,
    SKILLS_DIR,
    CRON_DIR,
    CRON_HISTORY_DIR,
    DATA_DIR,
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
 * Check if VELA_HOME has been initialized.
 */
export function isInitialized(): boolean {
  return existsSync(CONFIG_PATH);
}
