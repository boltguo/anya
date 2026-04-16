/**
 * @module config/schema
 * @description Zod schema for validating ~/.anya/config.json.
 */
import { z } from 'zod';

export const PartialAnyaConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().optional(),
  agent: z.object({
    name: z.string().optional(),
    personality: z.string().optional(),
  }).optional(),
  provider: z.object({
    model: z.string().optional(),
    max_tokens: z.number().optional(),
    temperature: z.number().optional(),
    max_retries: z.number().optional(),
  }).optional(),
  gemini: z.object({
    api_key: z.string().optional(),
    vision_model: z.string().optional(),
    image_model: z.string().optional(),
    aspect_ratio: z.string().optional(),
  }).optional(),
  tools: z.object({
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
  }).optional(),
  security: z.object({
    allowed_paths: z.array(z.string()).optional(),
    fence_mode: z.enum(['ask', 'deny', 'allow']).optional(),
  }).optional(),
  telegram: z.object({
    enabled: z.boolean().optional(),
    bot_token: z.string().optional(),
    allowed_user_ids: z.array(z.number()).optional(),
  }).optional(),
  stt: z.object({
    groq_api_key: z.string().optional(),
    model: z.string().optional(),
  }).optional(),
  tts: z.object({
    voice: z.string().optional(),
    rate: z.string().optional(),
  }).optional(),
  azure: z.object({
    speech_key: z.string().optional(),
    speech_region: z.string().optional(),
  }).optional(),
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
