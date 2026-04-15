/**
 * @module agent/promptBuilder
 * @description Assembles the system prompt from layered configuration files.
 *
 * System prompt composition (in order):
 *
 * ```
 * ┌─────────────────────────────────────┐
 * │  1. SOUL.md — Identity & Personality │  "Who Anya is"
 * ├─────────────────────────────────────┤
 * │  2. RULES.md — Operational Rules     │  "How Anya operates"
 * ├─────────────────────────────────────┤
 * │  3. Memory — USER.md + MEMORY.md     │  "Who the user is & what happened"
 * ├─────────────────────────────────────┤
 * │  4. Skills Index — Available skills  │  "What Anya can do"
 * ├─────────────────────────────────────┤
 * │  5. Security — Path & shell rules    │  "What Anya must not do"
 * ├─────────────────────────────────────┤
 * │  6. Timestamp — Current date/time    │  "When it is now"
 * └─────────────────────────────────────┘
 * ```
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { SOUL_PATH, RULES_PATH, USER_MD_PATH, MEMORY_MD_PATH } from '../lib/paths.js';
import type { AnyaConfig } from '../config/defaults.js';
import { buildSkillIndex } from '../skills/loader.js';

const FILE_CACHE_TTL_MS = 30_000;
const fileCache = new Map<string, { content: string; mtime: number; cachedAt: number }>();

/**
 * Build the complete system prompt for the Agent.
 *
 * @param config - The current agent configuration.
 * @returns Assembled system prompt string.
 */
export function buildSystemPrompt(config: AnyaConfig): string {
  const sections: string[] = [];

  // ── 1. Identity & Personality (SOUL) ───────────────────────────────
  const soul = loadFile(SOUL_PATH);
  sections.push(soul || config.agent.personality);

  // ── 2. Operational Rules (RULES) ───────────────────────────────────
  const rules = loadFile(RULES_PATH);
  if (rules) {
    sections.push(rules);
  }

  // ── 3. Current timestamp ───────────────────────────────────────────
  sections.push(`\nCurrent date and time: ${new Date().toISOString()}`);

  // ── 4. Memory (user profile + agent notes) ─────────────────────────
  const userMemory = loadFile(USER_MD_PATH);
  const agentMemory = loadFile(MEMORY_MD_PATH);

  if (userMemory || agentMemory) {
    sections.push('\n## Memory\n');
    if (userMemory) {
      sections.push('### About the User');
      sections.push(userMemory);
    }
    if (agentMemory) {
      sections.push('### Agent Notes');
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
  sections.push('- Shell commands require user approval unless they are in the allowlist.');
  sections.push('- Never execute destructive commands without explicit user confirmation.');

  // ── 7. Platform capabilities ────────────────────────────────────────
  const enabled = config.tools?.enabled ?? [];
  const caps: string[] = [];

  if (enabled.includes('tts')) {
    caps.push('- **TTS (Text-to-Speech)**: You have the `tts` tool. Use it to generate speech audio from any text. It sends as a voice bubble on Telegram. Always use the `tts` tool when the user asks you to read, speak, pronounce, or generate audio. You can specify voice (e.g. "zh-CN-XiaoxiaoNeural" for Chinese).');
  }

  if (enabled.includes('tg')) {
    caps.push('- **Rich Media**: On Telegram, use the `tg` tool with type "photo" or "audio" to send images/audio with captions. Use `<tg-spoiler>text</tg-spoiler>` in HTML to hide text (tap to reveal — great for learning/quiz scenarios).');
  }

  if (config.provider?.gemini?.api_key || config.provider?.gemini?.api_keys?.length) {
    caps.push('- **Vision**: When the user sends a photo, it is automatically analyzed and the description is provided to you as text.');
  }

  if (enabled.includes('image_gen')) {
    caps.push('- **Image Generation**: You have the `image_gen` tool. Use it to generate images from text descriptions. After generating, use the `tg` tool with type="photo" and the returned path as `url` to send it to the user.');
  }

  if (enabled.includes('pron_assess')) {
    caps.push('- **Pronunciation Assessment**: You have the `pron_assess` tool (Azure Speech). Call it with `audio_path` from voice message metadata. Rules for when to use:');
    caps.push('  - ✅ User explicitly asks for pronunciation feedback ("评测一下发音", "assess my pronunciation")');
    caps.push('  - ✅ User is in a speaking practice session (you asked them to read a sentence, they sent voice)');
    caps.push('  - ❌ User just sends a regular voice message to chat — do NOT assess, just respond normally');
    caps.push('  - Format results clearly: overall score, weak words highlighted, actionable tips');
  }

  // Multi-tool combination guidance
  if (enabled.includes('tg') && (enabled.includes('tts') || enabled.includes('image_gen'))) {
    caps.push('');
    caps.push('### Multi-Message Replies');
    caps.push('You can (and should) send **multiple messages of different types** in a single turn when the user\'s request involves multiple outputs. Call tools sequentially:');
    caps.push('1. Use `tg` type="text" for text content');
    caps.push('2. Use `image_gen` to generate an image, then `tg` type="photo" with the returned path to send it');
    caps.push('3. Use `tts` to generate voice audio (automatically sent as a voice bubble)');
    caps.push('Example: If the user says "write an article and read it to me with an illustration", you should: (1) send the article text via `tg`, (2) generate an image via `image_gen` then send via `tg` photo, (3) generate audio via `tts`. **Do not just reply with plain text when you have tools to deliver richer output.**');
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
