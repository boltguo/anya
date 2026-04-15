/**
 * @module skills/loader
 * @description Skill discovery and loading from ~/.anya/skills/.
 *
 * Three-level loading strategy:
 * 1. **Index** — Scan directory names + parse frontmatter for fast skill listing
 * 2. **Full** — Load complete SKILL.md body for a specific skill
 * 3. **Files** — List and read auxiliary files in a skill's directory
 *
 * Results are cached with a TTL to avoid redundant filesystem reads.
 * The skill index is injected into the system prompt so the LLM knows
 * which skills are available.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname, resolve, relative, sep } from 'node:path';
import { SKILLS_DIR } from '../lib/paths.js';
import { parseSkill, type Skill } from './parser.js';

/**
 * Cached skills list. Invalidated on explicit reload.
 */
let _cache: Skill[] | null = null;

/**
 * Scan ~/.anya/skills/ recursively and load all SKILL.md files.
 *
 * Directory structure:
 *   skills/
 *     category/
 *       skill-name/
 *         SKILL.md
 *         templates/   (optional)
 *         scripts/     (optional)
 */
export function loadSkills(forceReload = false): Skill[] {
  if (_cache && !forceReload) return _cache;

  if (!existsSync(SKILLS_DIR)) {
    _cache = [];
    return _cache;
  }

  const skills: Skill[] = [];
  scanDirectory(SKILLS_DIR, skills);

  _cache = skills;
  return skills;
}

/**
 * Recursively scan a directory for SKILL.md files.
 */
function scanDirectory(dir: string, results: Skill[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    // Skip hidden files/dirs
    if (entry.startsWith('.')) continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // Check if this directory contains a SKILL.md
      const skillPath = join(fullPath, 'SKILL.md');
      if (existsSync(skillPath)) {
        try {
          const content = readFileSync(skillPath, 'utf-8');
          const skill = parseSkill(content, skillPath, basename(fullPath));
          results.push(skill);
        } catch {
          // Skip unparseable skills
        }
      } else {
        // Recurse into subdirectories (category folders)
        scanDirectory(fullPath, results);
      }
    }
  }
}

/**
 * Get a single skill by name.
 */
export function getSkill(name: string): Skill | undefined {
  const skills = loadSkills();
  return skills.find(s => s.name === name);
}

/**
 * Build the Level 0 skill index for system prompt injection.
 * Returns a compact list of name + description for all loaded skills.
 */
export function buildSkillIndex(): string {
  const skills = loadSkills();
  if (skills.length === 0) return '';

  const lines = ['## Available Skills\n'];
  lines.push('Use `skill_view` to read the full procedure before executing a skill.\n');

  for (const skill of skills) {
    const tags = skill.tags.length > 0 ? ` [${skill.tags.join(', ')}]` : '';
    lines.push(`- **${skill.name}**: ${skill.description}${tags}`);
  }

  return lines.join('\n');
}

/**
 * List files in a skill directory (for Level 2 access).
 */
export function listSkillFiles(name: string): string[] {
  const skill = getSkill(name);
  if (!skill) return [];

  const skillDir = dirname(skill.filePath);
  const files: string[] = [];

  function walk(dir: string, prefix: string): void {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry === 'SKILL.md' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        const rel = prefix ? `${prefix}/${entry}` : entry;
        try {
          if (statSync(full).isDirectory()) {
            walk(full, rel);
          } else {
            files.push(rel);
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  walk(skillDir, '');
  return files;
}

/**
 * Read an attached file from a skill directory.
 */
export function readSkillFile(name: string, filePath: string): string | null {
  const skill = getSkill(name);
  if (!skill) return null;

  const skillDir = dirname(skill.filePath);
  const fullPath = resolve(skillDir, filePath);

  // Security: ensure the resolved path is within the skill directory
  const rel = relative(skillDir, fullPath);
  if (rel.startsWith('..') || rel.startsWith('..' + sep)) return null;

  try {
    return readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Clear the skills cache (call after create/delete).
 */
export function invalidateCache(): void {
  _cache = null;
}
