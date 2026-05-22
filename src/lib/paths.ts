// lib/paths.ts — application directory layout

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

// ANYA_HOME env var supports CI/test isolation
export const ANYA_HOME = process.env.ANYA_HOME || join(homedir(), '.anya');

export const CONFIG_PATH = join(ANYA_HOME, 'config.json');
export const CONFIG_SCHEMA_PATH = join(ANYA_HOME, 'config.schema.json');
export const AUTH_PATH = join(ANYA_HOME, 'auth.json');

export const MEMORY_DIR = join(ANYA_HOME, 'memories');
export const SOUL_PATH = join(MEMORY_DIR, 'SOUL.md');
export const RULES_PATH = join(MEMORY_DIR, 'RULES.md');
export const USER_MD_PATH = join(MEMORY_DIR, 'USER.md');
export const MEMORY_MD_PATH = join(MEMORY_DIR, 'MEMORY.md');

export const SKILLS_DIR = join(ANYA_HOME, 'skills');

export const DATA_DIR = join(ANYA_HOME, 'data');
export const STORE_DIR = join(DATA_DIR, 'store');
export const DB_PATH = join(STORE_DIR, 'state.db');
export const SEARCH_CACHE_DIR = join(DATA_DIR, 'search');
export const CACHE_DIR = join(DATA_DIR, 'cache');
export const AUDIO_CACHE_DIR = join(DATA_DIR, 'audio');
export const VOICE_DIR = join(AUDIO_CACHE_DIR, 'voice');
export const TTS_DIR = join(AUDIO_CACHE_DIR, 'tts');
export const IMAGE_DIR = join(DATA_DIR, 'images');
export const IMAGE_RECEIVED_DIR = join(IMAGE_DIR, 'received');

export const LOGS_DIR = join(ANYA_HOME, 'logs');
export const RUN_DIR = join(ANYA_HOME, 'run');

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
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export function isInitialized(): boolean {
  return existsSync(CONFIG_PATH);
}
