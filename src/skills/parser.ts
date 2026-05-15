// skills/parser.ts — parse SKILL.md frontmatter and body

import matter from 'gray-matter';

export interface Skill {
  name: string;
  description: string;
  // Registers as a Telegram /command when true
  command: boolean;
  body: string;
  filePath: string;
}

export function parseSkill(content: string, filePath: string, fallbackName?: string): Skill {
  const { data, content: body } = matter(content);

  return {
    name: String(data.name || fallbackName || 'unnamed'),
    description: String(data.description || ''),
    command: data.command === true,
    body: body.trim(),
    filePath,
  };
}
