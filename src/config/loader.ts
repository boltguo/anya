/**
 * @module config/loader
 * @description Manages configuration loading, migration, and layered merging.
 *
 * Implements a three-layer priority system:
 * 1. Default values (lowest priority, safe fallbacks).
 * 2. User-defined JSON (`~/.anya/config.json`).
 * 3. Environment variables (highest priority).
 *
 * It also automatically migrates outdated configuration formats and provides Zod-based
 * advisory validation, emitting warnings rather than hard-failing to preserve agent availability.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CONFIG_PATH } from '../lib/paths.js';
import { DEFAULT_CONFIG, type AnyaConfig } from './defaults.js';
import { PartialAnyaConfigSchema } from './schema.js';

/**
 * Deeply merges two objects, recursively copying properties.
 * Source values override target values. Array properties are completely replaced
 * rather than appended or concatenated.
 *
 * @param {Record<string, any>} target - The base object providing default values.
 * @param {Record<string, any>} source - The incoming object providing overrides.
 * @returns {Record<string, any>} A new object containing the merged results.
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
 * Mutates the configuration object by applying specific environment variable overrides.
 * Expected convention is `ANYA_<SECTION>_<KEY>` in uppercase.
 *
 * @param {AnyaConfig} config - The configuration object to mutate.
 * @returns {AnyaConfig} The mutated configuration object.
 */
function applyEnvOverrides(config: AnyaConfig): AnyaConfig {
  const envMap: Record<string, (c: AnyaConfig, v: string) => void> = {
    ANYA_GEMINI_API_KEY: (c, v) => { c.gemini.api_key = v; },
    ANYA_TAVILY_API_KEY: (c, v) => { c.tools.web_search.api_key = v; },
    ANYA_TELEGRAM_BOT_TOKEN: (c, v) => { c.telegram.bot_token = v; },
    ANYA_LOG_LEVEL: (c, v) => { c.advanced.log_level = v; },
    ANYA_MODEL: (c, v) => { c.provider.model = v; },
  };

  for (const [envKey, setter] of Object.entries(envMap)) {
    const value = process.env[envKey];
    if (value) setter(config, value);
  }

  return config;
}

/**
 * Migrates a raw, potentially outdated configuration object to the latest schema version (v0.4.0).
 * Cleans up deprecated sections and automatically writes the migrated format back to disk.
 *
 * @param {Record<string, any>} raw - The raw JSON configuration read from disk.
 * @returns {Record<string, any>} The migrated configuration object.
 */
function migrateConfig(raw: Record<string, any>): Record<string, any> {
  const migrated = { ...raw };

  // v0.3 (google) → v0.4 (gemini)
  if (raw.google && typeof raw.google === 'object') {
    migrated.gemini = {
      api_key: raw.google.api_key || '',
    };
    delete migrated.google;
  }

  // v0.2 (provider.gemini/openai) → v0.4
  const provider = raw.provider;
  if (provider && (provider.gemini || provider.openai || provider.active)) {
    migrated.provider = {
      model: provider.gemini?.model || provider.openai?.model || 'gemini-3-flash-preview',
      max_tokens: provider.max_tokens || 8192,
      temperature: provider.temperature ?? 0.7,
      max_retries: provider.max_retries || 3,
    };

    if (!migrated.gemini) {
      migrated.gemini = {
        api_key: provider.gemini?.api_key || '',
      };
    }
  }

  // Clean up old sections
  delete migrated.vertex;
  delete migrated.image_gen;
  delete migrated.vision;

  // Clean up legacy tool config.
  if (migrated.tools && typeof migrated.tools === 'object') {
    delete migrated.tools.shell;
    if (Array.isArray(migrated.tools.enabled)) {
      migrated.tools.enabled = migrated.tools.enabled
        .filter((t: string) => t !== 'shell' && t !== 'reset_context')
        .map((t: string) => t === 'tg' ? 'tg_msg' : t);
      if (!migrated.tools.enabled.includes('cron')) {
        migrated.tools.enabled.push('cron');
      }
      migrated.tools.enabled = [...new Set(migrated.tools.enabled)];
    }
  }

  if (JSON.stringify(migrated) !== JSON.stringify(raw)) {
    try {
      writeFileSync(CONFIG_PATH, JSON.stringify(migrated, null, 2) + '\n', 'utf-8');
    } catch { /* non-critical */ }
  }

  return migrated;
}

/**
 * Singleton configuration instance.
 * @type {AnyaConfig | null}
 */
let _config: AnyaConfig | null = null;

/**
 * Reads, validates, and builds the final configuration object.
 * Follows the priority order: Built-in Defaults < File Configuration < Environment Variables.
 * Automatically logs validation warnings for schema mismatches.
 *
 * @returns {AnyaConfig} The finalized, active application configuration.
 */
export function loadConfig(): AnyaConfig {
  let fileConfig: Partial<AnyaConfig> = {};

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, any>;
      const migrated = migrateConfig(parsed);

      // Validate via zod — any failure is surfaced with the offending path(s)
      // but we still merge with defaults so the agent keeps running.
      const result = PartialAnyaConfigSchema.safeParse(migrated);
      if (!result.success) {
        const issues = result.error.issues
          .slice(0, 5)
          .map((i) => `  • ${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('\n');
        console.error(`Warning: config.json has invalid fields (using sane defaults for them):\n${issues}`);
      }
      fileConfig = migrated as Partial<AnyaConfig>;
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
 * Retrieves the current configuration singleton, lazily loading it if necessary.
 *
 * @returns {AnyaConfig} The active application configuration.
 */
export function getConfig(): AnyaConfig {
  if (!_config) {
    return loadConfig();
  }
  return _config;
}

/**
 * Saves the provided configuration, or the current active configuration, to the filesystem.
 *
 * @param {AnyaConfig} [config] - Optional configuration object to save. Defaults to active configuration.
 * @returns {void}
 * @throws {Error} Throws if attempting to save before a config has been loaded or created.
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
 * Performs a best-effort persistence of a mutated configuration object.
 * Designed to silently fail if filesystem access is denied, allowing in-memory state to persist.
 *
 * @param {AnyaConfig} config - The configuration object to write to disk.
 * @returns {void}
 */
export function persistConfig(config: AnyaConfig): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  } catch {
    // Intentionally silent — in-memory config still works this session.
  }
}

/**
 * Nullifies the configuration singleton instance, primarily used for test isolation.
 *
 * @returns {void}
 */
export function resetConfig(): void {
  _config = null;
}
