/**
 * @module config/schema
 * @description Zod schema for validating ~/.anya/config.json.
 *
 * Validation is **advisory**: on failure we log a readable error and fall back
 * to the built-in defaults rather than crashing, so a malformed config cannot
 * take the agent offline.
 *
 * Every field is optional because user configs routinely omit whole sections —
 * the loader merges with {@link DEFAULT_CONFIG} to fill gaps.
 *
 * @see {@link ../config/loader} for how this schema is consumed.
 */
import { z } from 'zod';

const ProviderSchema = z.object({
  active: z.enum(['gemini', 'openai']).optional(),
  gemini: z.object({
    model: z.string().optional(),
    api_key: z.string().optional(),
    api_keys: z.array(z.string()).optional(),
  }).optional(),
  openai: z.object({
    model: z.string().optional(),
  }).optional(),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  max_retries: z.number().optional(),
}).optional();

const ToolsSchema = z.object({
  enabled: z.array(z.string()).optional(),
  shell: z.object({
    require_approval: z.boolean().optional(),
    approval_allowlist: z.array(z.string()).optional(),
    working_directory: z.string().optional(),
  }).optional(),
  web_search: z.object({
    backend: z.string().optional(),
    api_key: z.string().optional(),
    max_results: z.number().optional(),
  }).optional(),
}).optional();

const SecuritySchema = z.object({
  allowed_paths: z.array(z.string()).optional(),
  fence_mode: z.enum(['ask', 'deny', 'allow']).optional(),
}).optional();

const TelegramSchema = z.object({
  enabled: z.boolean().optional(),
  bot_token: z.string().optional(),
  allowed_user_ids: z.array(z.number()).optional(),
}).optional();

const SttSchema = z.object({
  groq_api_key: z.string().optional(),
  model: z.string().optional(),
}).optional();

const VisionSchema = z.object({
  gemini_api_key: z.string().optional(),
  model: z.string().optional(),
}).optional();

const TtsSchema = z.object({
  voice: z.string().optional(),
  rate: z.string().optional(),
}).optional();

export const PartialAnyaConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().optional(),
  agent: z.object({
    name: z.string().optional(),
    personality: z.string().optional(),
  }).optional(),
  provider: ProviderSchema,
  tools: ToolsSchema,
  security: SecuritySchema,
  telegram: TelegramSchema,
  stt: SttSchema,
  vision: VisionSchema,
  tts: TtsSchema,
  cron: z.object({ enabled: z.boolean().optional() }).optional(),
  ui: z.object({
    show_tool_calls: z.boolean().optional(),
    show_thinking: z.boolean().optional(),
  }).optional(),
  advanced: z.object({
    context_window: z.number().optional(),
    compress_threshold: z.number().optional(),
    session_history_limit: z.number().optional(),
    max_history_messages: z.number().optional(),
    log_level: z.string().optional(),
    max_react_loops: z.number().optional(),
  }).optional(),
});
