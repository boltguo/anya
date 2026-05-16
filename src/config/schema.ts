// config/schema.ts — Zod schema for AnyaConfig

import { z } from 'zod';

// all fields optional so user file only declares overrides
export const PartialAnyaConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().optional(),
  provider: z.object({
    model: z.string().optional(),
    max_retries: z.number().optional(),
    context_window: z.number().optional(),
    compress_threshold: z.number().optional(),
    max_history_messages: z.number().optional(),
    max_react_loops: z.number().optional(),
  }).optional(),
  gemini: z.object({
    api_key: z.string().optional(),
    vision_model: z.string().optional(),
  }).optional(),
  web_search: z.object({
    api_key: z.string().optional(),
    max_results: z.number().optional(),
  }).optional(),
  azure: z.object({
    speech_key: z.string().optional(),
    speech_region: z.string().optional(),
  }).optional(),
  stt: z.object({
    groq_api_key: z.string().optional(),
    model: z.string().optional(),
  }).optional(),
  tts: z.object({
    voice: z.string().optional(),
    rate: z.string().optional(),
  }).optional(),
  telegram: z.object({
    enabled: z.boolean().optional(),
    bot_token: z.string().optional(),
    allowed_user_ids: z.array(z.number()).optional(),
  }).optional(),
  cron: z.object({
    enabled: z.boolean().optional(),
    tick_seconds: z.number().optional(),
    timezone: z.string().optional(),
    default_platform: z.string().optional(),
    default_chat_id: z.string().optional(),
  }).optional(),
  security: z.object({
    allowed_paths: z.array(z.string()).optional(),
  }).optional(),
  ui: z.object({
    show_tool_calls: z.boolean().optional(),
  }).optional(),
  onboarding: z.object({
    profile_done: z.boolean().optional(),
    placement_done: z.boolean().optional(),
  }).optional(),
});
