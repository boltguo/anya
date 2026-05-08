/**
 * @module config/schema
 * @description Zod schema for validating ~/.anya/config.json.
 */
import { z } from 'zod';

export const PartialAnyaConfigSchema = z.object({
  $schema: z.string().optional(),
  version: z.string().optional(),
  provider: z.object({
    model: z.string().optional(),
    max_tokens: z.number().optional(),
    temperature: z.number().optional(),
    max_retries: z.number().optional(),
  }).optional(),
  gemini: z.object({
    api_key: z.string().optional(),
    vision_model: z.string().optional(),
  }).optional(),
  tools: z.object({
    enabled: z.array(z.string()).optional(),
    web_search: z.object({
      backend: z.string().optional(),
      api_key: z.string().optional(),
      max_results: z.number().optional(),
    }).optional(),
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
  stt: z.object({
    groq_api_key: z.string().optional(),
    model: z.string().optional(),
  }).optional(),
  azure: z.object({
    speech_key: z.string().optional(),
    speech_region: z.string().optional(),
  }).optional(),
  advanced: z.object({
    context_window: z.number().optional(),
    compress_threshold: z.number().optional(),
    max_history_messages: z.number().optional(),
    log_level: z.string().optional(),
    max_react_loops: z.number().optional(),
  }).optional(),
});
