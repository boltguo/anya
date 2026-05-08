/**
 * @module lib/paths
 * @description Centralized directory hierarchy and path resolution for Anya.
 *
 * Consolidates all application data into a single root directory (`ANYA_HOME`),
 * ensuring atomic state, trivial portability, and isolated test environments.
 *
 * Directory architecture:
 * ```
 * ~/.anya/                         (ANYA_HOME)
 * ├── config.json                  Runtime configuration
 * ├── auth.json                    Secure token store
 * ├── memories/                    Durable identity and knowledge base
 * │   ├── SOUL.md                  Agent persona and identity
 * │   ├── RULES.md                 Behavioral directives
 * │   ├── USER.md                  User profile modeling
 * │   └── MEMORY.md                Temporal learning state
 * ├── skills/                      Dynamically loaded expert capabilities
 * ├── data/                        Application persistent state
 * │   ├── store/                   SQLite databases
 * │   │   └── state.db             Session histories and graphs
 * │   ├── search/                  Web scraping artifact cache
 * │   └── cache/                   Generic ephemeral storage
 * ├── logs/                        Structured telemetry
 * ├── run/                         Process lifecycle flags (PIDs)
 * └── cron/                        Scheduled execution state
 * ```
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

/**
 * The single root namespace directory for all agent configurations and data artifacts.
 * Supports environment variable injection (`ANYA_HOME`) for CI/testing isolation.
 * @constant {string}
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

// ── Data (persistent storage) ────────────────────────────────────────────────

/** Root data directory for unstructured and structured storage. */
export const DATA_DIR = join(ANYA_HOME, 'data');

/** SQLite database root directory. */
export const STORE_DIR = join(DATA_DIR, 'store');

/** Primary relation database housing sessions and messages. */
export const DB_PATH = join(STORE_DIR, 'state.db');

/** Caching directory for HTTP web crawler artifacts. */
export const SEARCH_CACHE_DIR = join(DATA_DIR, 'search');

/** General-purpose volatile cache directory. */
export const CACHE_DIR = join(DATA_DIR, 'cache');

/** Root artifact cache for ingested and generated audio. */
export const AUDIO_CACHE_DIR = join(DATA_DIR, 'audio');

/** Extracted raw voice messages (e.g., from Telegram). */
export const VOICE_DIR = join(AUDIO_CACHE_DIR, 'voice');

/** Processed and synthesized TTS audio outputs. */
export const TTS_DIR = join(AUDIO_CACHE_DIR, 'tts');

/** Root artifact cache for image blobs. */
export const IMAGE_DIR = join(DATA_DIR, 'images');

/** Images sourced from external adapters (e.g., Telegram photos). */
export const IMAGE_RECEIVED_DIR = join(IMAGE_DIR, 'received');

// ── Runtime ──────────────────────────────────────────────────────────────────
export const LOGS_DIR = join(ANYA_HOME, 'logs');
export const RUN_DIR = join(ANYA_HOME, 'run');

// ── Cron ────────────────────────────────────────────────────────────────────
export const CRON_DIR = join(ANYA_HOME, 'cron');
export const CRON_JOBS_PATH = join(CRON_DIR, 'jobs.json');
export const CRON_OUTPUT_DIR = join(CRON_DIR, 'output');

// ── Directory Setup ──────────────────────────────────────────────────────────

/**
 * Initializes the entire application filesystem hierarchy.
 * Bootstraps necessary nested folders required prior to database mounting or logging.
 * This function is inherently idempotent.
 */
export function ensureDirectories(): void {
  const dirs = [
    ANYA_HOME,
    MEMORY_DIR,
    SKILLS_DIR,
    DATA_DIR,
    STORE_DIR,
    SEARCH_CACHE_DIR,
    CACHE_DIR,
    AUDIO_CACHE_DIR,
    VOICE_DIR,
    TTS_DIR,
    IMAGE_DIR,
    IMAGE_RECEIVED_DIR,
    LOGS_DIR,
    RUN_DIR,
    CRON_DIR,
    CRON_OUTPUT_DIR,
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Evaluates whether the primary workspace configuration environment is fully instantiated.
 *
 * @returns {boolean} True if the system configuration file exists.
 */
export function isInitialized(): boolean {
  return existsSync(CONFIG_PATH);
}
