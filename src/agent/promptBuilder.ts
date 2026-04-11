import { readFileSync, existsSync } from 'node:fs';
import { USER_MD_PATH, MEMORY_MD_PATH } from '../lib/paths.js';
import type { VelaConfig } from '../config/defaults.js';
import { getToolSchemas } from '../tools/registry.js';
import { buildSkillIndex } from '../skills/loader.js';

/**
 * Build the system prompt for the Agent.
 *
 * Includes:
 * 1. Agent personality
 * 2. Available tools overview
 * 3. Memory (USER.md + MEMORY.md)
 * 4. Behavioral constraints
 */
export function buildSystemPrompt(config: VelaConfig): string {
  const sections: string[] = [];

  // --- 1. Identity & Personality ---
  sections.push(config.agent.personality);

  // --- 2. Current date/time ---
  sections.push(`\nCurrent date and time: ${new Date().toISOString()}`);

  // --- 3. Memory ---
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

  // --- 4. Tool usage guidelines ---
  const tools = getToolSchemas(config);
  if (tools.length > 0) {
    sections.push('\n## Available Tools\n');
    sections.push('You have access to the following tools. Use them when appropriate to complete tasks:\n');

    for (const tool of tools) {
      sections.push(`- **${tool.name}**: ${tool.description}`);
    }

    sections.push('\n### Tool Usage Guidelines');
    sections.push('- Use tools proactively when they can help answer the question better.');
    sections.push('- For file operations, use absolute paths or paths starting with ~.');
    sections.push('- When a tool returns an error, analyze the error and try a different approach.');
    sections.push('- Do not fabricate tool results -- always call the tool to get real data.');
  }

  // --- 5. Security constraints ---
  sections.push('\n## Security');
  sections.push(`- Your default working directory is ~/.vela/. File operations outside ${config.security.allowed_paths.join(', ')} require user approval.`);
  sections.push('- Shell commands require user approval unless they are in the allowlist.');
  sections.push('- Never execute destructive commands without explicit user confirmation.');

  // --- 5.5. Skills index (Level 0) ---
  const skillIndex = buildSkillIndex();
  if (skillIndex) {
    sections.push('\n' + skillIndex);
  }

  // --- 6. Self-improvement hint ---
  sections.push('\n## On Self-Improvement');
  sections.push('If you learned something valuable about the user (preferences, tech stack, workflow), use `memory_update` to save it.');
  sections.push('- Update "user" target for user profile info (preferences, background, work style).');
  sections.push('- Update "memory" target for your own notes (project context, decisions, lessons learned).');
  sections.push('');
  sections.push('If you just completed a non-trivial task (5+ tool calls, debugging through errors,');
  sections.push('or discovered a workflow you did not know before), consider using `skill_manage` to');
  sections.push('save what you learned as a reusable skill. Future you will thank present you.');
  sections.push('');
  sections.push('Skills should be:');
  sections.push('- Specific enough to be useful (not "how to code")');
  sections.push('- General enough to apply to similar tasks (not "fix this exact bug")');
  sections.push('- Written as a procedure, not a story');

  // --- 7. Response guidelines ---
  sections.push('\n## Response Guidelines');
  sections.push('- Be concise and direct. Avoid unnecessary filler.');
  sections.push('- Match the user\'s language. If they write in Chinese, reply in Chinese; if English, reply in English.');
  sections.push('- For code, include brief explanations of non-obvious parts.');
  sections.push('- When a task is complete, confirm what was done clearly.');

  return sections.join('\n');
}

/**
 * Safely load a file's content, returning empty string if not found.
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
