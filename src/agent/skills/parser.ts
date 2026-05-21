// agent/skills/parser.ts — parse SKILL.md frontmatter and body

import matter from 'gray-matter';

export interface Skill {
  name: string;
  description: string;
  // Registers as a Telegram /command when true
  command: boolean;
  // Tier-2 compound tools this skill needs. Drives per-turn tool filtering
  // when this skill is the session's active_skill. Empty for LLM-driven skills
  // (planner, profile-manager) that only use baseline Tier-1 tools.
  requiredTools: string[];
  body: string;
  filePath: string;
}

function normalizeRequiredTools(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(name => name.length > 0);
}

export function parseSkill(content: string, filePath: string, fallbackName?: string): Skill {
  const { data, content: body } = matter(content);

  return {
    name: String(data.name || fallbackName || 'unnamed'),
    description: String(data.description || ''),
    command: data.command === true,
    requiredTools: normalizeRequiredTools(data.required_tools),
    body: body.trim(),
    filePath,
  };
}
