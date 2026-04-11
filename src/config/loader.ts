import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CONFIG_PATH } from '../lib/paths.js';
import { DEFAULT_CONFIG, type VelaConfig } from './defaults.js';

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
 * Convention: VELA_<SECTION>_<KEY> in uppercase.
 */
function applyEnvOverrides(config: VelaConfig): VelaConfig {
  const envMap: Record<string, (c: VelaConfig, v: string) => void> = {
    VELA_GEMINI_API_KEY: (c, v) => { c.provider.api_key = v; },
    VELA_TAVILY_API_KEY: (c, v) => { c.tools.web_search.api_key = v; },
    VELA_TELEGRAM_BOT_TOKEN: (c, v) => { c.telegram.bot_token = v; },
    VELA_LOG_LEVEL: (c, v) => { c.advanced.log_level = v; },
    VELA_MODEL: (c, v) => { c.provider.primary = v; },
  };

  for (const [envKey, setter] of Object.entries(envMap)) {
    const value = process.env[envKey];
    if (value) {
      setter(config, value);
    }
  }

  return config;
}

// Singleton config instance
let _config: VelaConfig | null = null;

/**
 * Load configuration from ~/.vela/config.json,
 * merge with defaults, and apply env overrides.
 *
 * Priority (low to high):
 * 1. Built-in defaults
 * 2. config.json
 * 3. Environment variables
 */
export function loadConfig(): VelaConfig {
  let fileConfig: Partial<VelaConfig> = {};

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      fileConfig = JSON.parse(raw) as Partial<VelaConfig>;
    } catch (err) {
      console.error(`Warning: Failed to parse config.json: ${(err as Error).message}`);
      console.error('   Using default configuration.');
    }
  }

  const merged = deepMerge(DEFAULT_CONFIG as Record<string, any>, fileConfig as Record<string, any>) as VelaConfig;
  const final = applyEnvOverrides(merged);

  _config = final;
  return final;
}

/**
 * Get the current config (loads if not yet loaded).
 */
export function getConfig(): VelaConfig {
  if (!_config) {
    return loadConfig();
  }
  return _config;
}

/**
 * Save the current config to disk.
 */
export function saveConfig(config?: VelaConfig): void {
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
