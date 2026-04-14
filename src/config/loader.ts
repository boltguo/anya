import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CONFIG_PATH } from '../lib/paths.js';
import { DEFAULT_CONFIG, type AnyaConfig } from './defaults.js';

/**
 * Deep merge two objects. Source values override target values.
 * Arrays are replaced, not merged.
 */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal) &&
      targetVal !== null
    ) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Apply environment variable overrides.
 * Convention: ANYA_<SECTION>_<KEY> in uppercase.
 */
function applyEnvOverrides(config: AnyaConfig): AnyaConfig {
  const envMap: Record<string, (c: AnyaConfig, v: string) => void> = {
    ANYA_GEMINI_API_KEY: (c, v) => { c.provider.gemini.api_key = v; },
    ANYA_TAVILY_API_KEY: (c, v) => { c.tools.web_search.api_key = v; },
    ANYA_TELEGRAM_BOT_TOKEN: (c, v) => { c.telegram.bot_token = v; },
    ANYA_LOG_LEVEL: (c, v) => { c.advanced.log_level = v; },
    ANYA_MODEL: (c, v) => {
      // Detect provider from model name
      if (v.startsWith('gpt') || v.startsWith('o1') || v.startsWith('o3')) {
        c.provider.active = 'openai';
        c.provider.openai.model = v;
      } else {
        c.provider.active = 'gemini';
        c.provider.gemini.model = v;
      }
    },
    ANYA_PROVIDER: (c, v) => { c.provider.active = v; },
  };

  for (const [envKey, setter] of Object.entries(envMap)) {
    const value = process.env[envKey];
    if (value) {
      setter(config, value);
    }
  }

  return config;
}

/**
 * Migrate v0.1 config (flat provider) to v0.2 (nested provider).
 * Handles existing configs that have provider.api_key and provider.primary.
 */
function migrateConfig(raw: Record<string, any>): Record<string, any> {
  const provider = raw.provider;
  if (!provider || typeof provider !== 'object') return raw;

  // Already v0.2+ format — has nested gemini/openai objects
  if (provider.gemini && typeof provider.gemini === 'object') return raw;

  // Migrate flat → nested
  const migrated = { ...raw };
  migrated.provider = {
    active: 'gemini',
    gemini: {
      model: provider.primary || 'gemini-3-flash-preview',
      api_key: provider.api_key || '',
    },
    openai: {
      model: 'gpt-5.4',
    },
    max_tokens: provider.max_tokens || 8192,
    temperature: provider.temperature ?? 0.7,
    max_retries: provider.max_retries || 3,
  };

  // Auto-save migrated config
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(migrated, null, 2) + '\n', 'utf-8');
  } catch {
    // Non-critical
  }

  return migrated;
}

// Singleton config instance
let _config: AnyaConfig | null = null;

/**
 * Load configuration from ~/.anya/config.json,
 * merge with defaults, and apply env overrides.
 *
 * Priority (low to high):
 * 1. Built-in defaults
 * 2. config.json (auto-migrated from v0.1 if needed)
 * 3. Environment variables
 */
export function loadConfig(): AnyaConfig {
  let fileConfig: Partial<AnyaConfig> = {};

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, any>;
      fileConfig = migrateConfig(parsed) as Partial<AnyaConfig>;
    } catch (err) {
      console.error(`Warning: Failed to parse config.json: ${(err as Error).message}`);
      console.error('   Using default configuration.');
    }
  }

  const merged = deepMerge(DEFAULT_CONFIG as Record<string, any>, fileConfig as Record<string, any>) as AnyaConfig;
  const final = applyEnvOverrides(merged);

  _config = final;
  return final;
}

/**
 * Get the current config (loads if not yet loaded).
 */
export function getConfig(): AnyaConfig {
  if (!_config) {
    return loadConfig();
  }
  return _config;
}

/**
 * Save the current config to disk.
 */
export function saveConfig(config?: AnyaConfig): void {
  const toSave = config || _config;
  if (!toSave) {
    throw new Error('No config to save. Load or create a config first.');
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
  _config = toSave;
}

/**
 * Reset the config singleton (for testing).
 */
export function resetConfig(): void {
  _config = null;
}
