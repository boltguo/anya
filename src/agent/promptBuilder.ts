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

import { readFileSync, existsSync } from 'node:fs';
import { SOUL_PATH, RULES_PATH, USER_MD_PATH, MEMORY_MD_PATH } from '../lib/paths.js';
import type { AnyaConfig } from '../config/defaults.js';
import { buildSkillIndex } from '../skills/loader.js';

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

  return sections.join('\n');
}

/**
 * Safely load a file's content, returning empty string if not found.
 * @param path - Absolute path to the file.
 */
function loadFile(path: string): string {
  if (!existsSync(path)) return '';

  try {
    const content = readFileSync(path, 'utf-8').trim();
    return content || '';
  } catch {
    return '';
  }
}
