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
 * │  2. SOUL.md — Identity               │  "Who Anya is"
 * ├─────────────────────────────────────┤
 * │  3. RULES.md — Operational Rules     │  "How Anya operates"
 * ├─────────────────────────────────────┤
 * │  4. Memory — USER.md + MEMORY.md     │  "User profile & learner level state"
 * ├─────────────────────────────────────┤
 * │  5. Skills Index — Available skills  │  "What Anya can do"
 * ├─────────────────────────────────────┤
 * │  6. Security — Local boundary        │  "What Anya owns"
 * ├─────────────────────────────────────┤
 * │  7. Platform Capabilities            │  "What tools/media are available"
 * └─────────────────────────────────────┘
 * ```
 *
 * Note: Timestamp is appended to the user message (not system prompt)
 * to maximise Gemini's prompt cache hit rate.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { SOUL_PATH, RULES_PATH, USER_MD_PATH, MEMORY_MD_PATH } from '../lib/paths.js';
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

  // ── 2. Identity (SOUL) ──────────────────────────────────────────────
  const soul = loadFile(SOUL_PATH);
  if (hasContent(soul)) {
    sections.push('\n## Identity (SOUL)');
    sections.push(soul);
  }

  // ── 3. Operational Rules (RULES) ───────────────────────────────────
  const rules = loadFile(RULES_PATH);
  if (hasContent(rules)) {
    sections.push('\n## Operating & Behavioral Rules');
    sections.push(rules);
  }

  // ── 4. Memory (USER.md + MEMORY.md) ────────────────────────────────
  const userMemory = loadFile(USER_MD_PATH);
  const agentMemory = loadFile(MEMORY_MD_PATH);
  const hasUser = hasContent(userMemory);
  const hasAgent = hasContent(agentMemory);
  if (hasUser || hasAgent) {
    sections.push('\n## Memory\n');
    if (hasUser) {
      sections.push('### User Profile');
      sections.push(userMemory);
    }
    if (hasAgent) {
      sections.push('\n### Learner Level & Ability State');
      sections.push(agentMemory);
    }
  }

  // ── 5. Skills index ────────────────────────────────────────────────
  const skillIndex = buildSkillIndex();
  if (skillIndex) {
    sections.push('\n' + skillIndex);
  }

  // ── 6. Local boundary ──────────────────────────────────────────────
  sections.push('\n## Security');
  sections.push(`- Your working boundary is Anya-owned local data: ${config.security.allowed_paths.join(', ')}.`);
  sections.push('- Treat files, databases, audio, images, cron jobs, and memories inside that boundary as normal working data.');
  sections.push('- Do not use file or database tools for user projects, system files, or arbitrary external paths unless the user has explicitly reconfigured the allowed paths.');

  // ── 7. Platform capabilities ────────────────────────────────────────
  // Note: tg_msg message types and formatting are covered in RULES.md.
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

function hasContent(text: string): boolean {
  if (!text) return false;
  const body = text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    })
    .join('\n')
    .trim();
  return Boolean(body) && body !== '(empty)';
}
