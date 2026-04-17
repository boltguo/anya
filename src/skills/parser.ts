/**
 * @module skills/parser
 * @description SKILL.md file parser using gray-matter for YAML frontmatter.
 *
 * Extracts the minimal metadata needed by the agent (name, description,
 * optional `command` flag) and the full markdown body.
 */

import matter from 'gray-matter';

/**
 * Parsed representation of a SKILL.md file.
 */
export interface Skill {
  /** Skill name (from frontmatter or directory name) */
  name: string;
  /** Short description shown in the index */
  description: string;
  /** Whether to register as a Telegram /command */
  command: boolean;
  /** Full markdown body */
  body: string;
  /** Absolute path to the SKILL.md file */
  filePath: string;
}

/**
 * Parse a SKILL.md file content into a Skill object.
 *
 * SKILL.md format:
 * ```
 * ---
 * name: react-debug
 * description: Debug React component rendering issues
 * command: true        # optional — registers as a Telegram /command
 * ---
 *
 * # When to Use
 * ...
 * ```
 */
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
