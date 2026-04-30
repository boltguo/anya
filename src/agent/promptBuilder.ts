/**
 * @module agent/promptBuilder
 * @description Assembles the system prompt from layered configuration files.
 *
 * System prompt composition (in order):
 *
 * ```
 * ┌─────────────────────────────────────┐
 * │  1. Config Personality               │  "Who the agent is"
 * ├─────────────────────────────────────┤
 * │  2. RULES.md — Operational Rules     │  "How Anya operates"
 * ├─────────────────────────────────────┤
 * │  3. Timestamp — Current date/time      │  "When it is now"
 * ├─────────────────────────────────────┤
 * │  4. User Profile — USER.md + MEMORY.md   │  "Who the user is & adaptive context"
 * ├─────────────────────────────────────┤
 * │  5. Skills Index — Available skills  │  "What Anya can do"
 * ├─────────────────────────────────────┤
 * │  6. Security — Path rules            │  "What Anya must not do"
 * ├─────────────────────────────────────┤
 * │  7. Platform Capabilities            │  "What tools/media are available"
 * └─────────────────────────────────────┘
 * ```
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { RULES_PATH, USER_MD_PATH, MEMORY_MD_PATH } from '../lib/paths.js';
import type { AnyaConfig } from '../config/defaults.js';
import { buildSkillIndex } from '../skills/loader.js';

const FILE_CACHE_TTL_MS = 300_000;
const fileCache = new Map<string, { content: string; mtime: number; cachedAt: number }>();

/**
 * Build the complete system prompt for the Agent.
 *
 * @param config - The current agent configuration.
 * @returns Assembled system prompt string.
 */
export function buildSystemPrompt(config: AnyaConfig): string {
  const sections: string[] = [];

  // ── 1. Identity & Personality (config) ─────────────────────────────
  sections.push(config.agent.personality);
  if (config.user.native_language.trim()) {
    sections.push(`Configured user context: native language = ${config.user.native_language.trim()}`);
  }

  // ── 2. Operational Rules (RULES) ───────────────────────────────────
  const rules = loadFile(RULES_PATH);
  if (rules) {
    sections.push(rules);
  }

  // ── 3. Memory (USER.md + MEMORY.md) ────────────────────────────────
  // NOTE: Timestamp moved to user message to preserve prompt cache prefix.
  const userMemory = loadFile(USER_MD_PATH);
  const agentMemory = loadFile(MEMORY_MD_PATH);
  if (userMemory || agentMemory) {
    sections.push('\n## Memory\n');
    if (userMemory) {
      sections.push('### User Profile');
      sections.push(userMemory);
    }
    if (agentMemory) {
      sections.push('\n### Agent Notes');
      sections.push(agentMemory);
    }
  }

  // ── 5. Skills index ────────────────────────────────────────────────
  const skillIndex = buildSkillIndex();
  if (skillIndex) {
    sections.push('\n' + skillIndex);
  }

  // ── 6. Security constraints ────────────────────────────────────────
  sections.push('\n## Security');
  sections.push(`- Your default working directory is ~/.anya/. File operations outside ${config.security.allowed_paths.join(', ')} require user approval.`);
  sections.push('- Use the database and file tools only for Anya-owned runtime data unless the user explicitly grants broader access.');

  // ── 7. Platform capabilities ────────────────────────────────────────
  // Note: tg message types and formatting are covered in RULES.md.
  // This section only adds tool-specific capabilities not in RULES.
  const enabled = config.tools?.enabled ?? [];
  const caps: string[] = [];

  if (enabled.includes('tts')) {
    caps.push('- **TTS**: `tts` tool generates speech audio (voice bubble on Telegram). Use when asked to read, speak, or pronounce. Voice options: e.g. "zh-CN-XiaoxiaoNeural" for Chinese.');
  }

  if (config.gemini?.api_key) {
    caps.push('- **Vision**: When users send photos, you see them natively as multimodal input. Describe what you see and respond in context.');
  }

  if (enabled.includes('pron_assess')) {
    caps.push('- **Pronunciation**: `pron_assess` tool (Azure Speech). Use `audio_path` from voice metadata. Only call during speaking practice or explicit request — NOT for regular voice messages.');
  }

  if (caps.length > 0) {
    sections.push('\n## Platform Capabilities\n');
    sections.push(caps.join('\n'));
  }

  return sections.join('\n');
}

/**
 * Load a file with mtime-aware caching.
 * Re-reads only when the file's mtime changes or the cache entry expires.
 */
function loadFile(filePath: string): string {
  if (!existsSync(filePath)) return '';

  try {
    const mtime = statSync(filePath).mtimeMs;
    const cached = fileCache.get(filePath);

    if (cached && cached.mtime === mtime && Date.now() - cached.cachedAt < FILE_CACHE_TTL_MS) {
      return cached.content;
    }

    const content = readFileSync(filePath, 'utf-8').trim();
    fileCache.set(filePath, { content, mtime, cachedAt: Date.now() });
    return content || '';
  } catch {
    return '';
  }
}
