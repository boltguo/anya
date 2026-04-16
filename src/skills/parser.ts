/**
 * @module skills/parser
 * @description SKILL.md file parser using gray-matter for YAML frontmatter.
 *
 * Extracts structured metadata (name, description, version, tags, category)
 * from the YAML frontmatter and the full markdown body from a SKILL.md file.
 */

import matter from 'gray-matter';

/**
 * Parsed representation of a SKILL.md file.
 */
export interface Skill {
  /** Skill name (from frontmatter or directory name) */
  name: string;
  /** Short description */
  description: string;
  /** Semantic version */
  version: string;
  /** Tags for categorization */
  tags: string[];
  /** Category (maps to subdirectory under skills/) */
  category: string;
  /** Whether to register as a Telegram /command */
  command: boolean;
  /** Full markdown body (Level 1 content) */
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
 * version: 1.0.0
 * tags: [react, debugging, frontend]
 * category: frontend
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
    version: String(data.version || '1.0.0'),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    category: String(data.category || 'general'),
    command: data.command === true,
    body: body.trim(),
    filePath,
  };
}
