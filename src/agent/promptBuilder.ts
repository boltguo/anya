/**
 * @module agent/promptBuilder
 * @description Engine for assembling the system prompt from hierarchical configurations.
 *
 * Constructs the system prompt dynamically based on the following composition order:
 * 1. SOUL.md — Identity ("Who Anya is")
 * 2. RULES.md — Operational Rules ("How Anya operates")
 * 3. Memory — USER.md + MEMORY.md ("User profile & learner state")
 * 4. Skills Index — Available capabilities ("What Anya can do")
 * 5. Security — Local data boundaries ("What Anya owns")
 * 6. Platform Capabilities — ("What tools or media are currently available")
 *
 * Timestamps are omitted from the system prompt to maintain cache stability; they are
 * instead appended directly to the user message dynamically in the agent loop.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { SOUL_PATH, RULES_PATH, USER_MD_PATH, MEMORY_MD_PATH } from '../lib/paths.js';
import type { AnyaConfig } from '../config/defaults.js';
import { buildSkillIndex } from '../skills/loader.js';

const FILE_CACHE_TTL_MS = 300_000;
const fileCache = new Map<string, { content: string; mtime: number; cachedAt: number }>();

/**
 * Builds the comprehensive system prompt for the Agent.
 *
 * Synthesizes data from local markdown files, capability registries, and user state.
 *
 * @param config - The current application and agent configuration object.
 * @returns The fully constructed system prompt string.
 */
export function buildSystemPrompt(config: AnyaConfig): string {
  const sections: string[] = [];

  // Identity definitions
  const soul = loadFile(SOUL_PATH);
  if (hasContent(soul)) {
    sections.push('## Identity (SOUL)');
    sections.push(soul);
  }

  // Operational directives
  const rules = loadFile(RULES_PATH);
  if (hasContent(rules)) {
    sections.push('\n## Operating & Behavioral Rules');
    sections.push(rules);
  }

  // Dynamic memory integrations
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

  // Skills discovery interface
  const skillIndex = buildSkillIndex();
  if (skillIndex) {
    sections.push('\n' + skillIndex);
  }

  // Mandatory boundary enforcement
  sections.push('\n## Security');
  sections.push(`- Your working boundary is Anya-owned local data: ${config.security.allowed_paths.join(', ')}.`);
  sections.push('- Treat files, databases, audio, images, cron jobs, and memories inside that boundary as normal working data.');
  sections.push('- Do not use file or database tools for user projects, system files, or arbitrary external paths unless the user has explicitly reconfigured the allowed paths.');

  // Contextual platform capabilities
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
 * Loads a file with `mtime`-aware memory caching.
 *
 * Ensures efficient disk access by bypassing I/O if the cache is hot and the
 * modification time of the target file has not changed.
 *
 * @param filePath - The absolute path of the file to load.
 * @returns The file content as a string, or an empty string if the file is missing or unreadable.
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

/**
 * Validates if the given text possesses meaningful content beyond empty headers.
 *
 * @param text - The markdown string to validate.
 * @returns True if the parsed text contains actionable content, otherwise false.
 */
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
