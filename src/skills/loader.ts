/**
 * @module skills/loader
 * @description Skill discovery and loading from ~/.anya/skills/.
 *
 * Three-level loading strategy:
 * 1. **Index** — Scan directory names + parse frontmatter for fast skill listing
 * 2. **Full** — Load complete SKILL.md body for a specific skill
 * 3. **Files** — List and read auxiliary files in a skill's directory
 *
 * The cache is invalidated automatically when any SKILL.md mtime changes
 * (or when the skills directory itself changes), so live edits get picked
 * up without restarting the bot. `invalidateCache()` is also exposed for
 * explicit refresh after create/delete.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname, resolve, relative, sep } from 'node:path';
import { SKILLS_DIR } from '../lib/paths.js';
import { parseSkill, type Skill } from './parser.js';

interface SkillCache {
  skills: Skill[];
  /** Map of SKILL.md path → mtimeMs at load time. */
  mtimes: Map<string, number>;
}

let _cache: SkillCache | null = null;

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
  if (!forceReload && _cache && isCacheFresh(_cache)) {
    return _cache.skills;
  }

  if (!existsSync(SKILLS_DIR)) {
    _cache = { skills: [], mtimes: new Map() };
    return _cache.skills;
  }

  const skills: Skill[] = [];
  const mtimes = new Map<string, number>();
  scanDirectory(SKILLS_DIR, skills, mtimes);

  _cache = { skills, mtimes };
  return skills;
}

/**
 * Cheap freshness check: re-stat each tracked SKILL.md and bail out if any
 * mtime moved. Adds/deletes are caught because the new file won't be in the
 * map (or a deleted file's stat will throw).
 */
function isCacheFresh(cache: SkillCache): boolean {
  for (const [path, mtime] of cache.mtimes) {
    try {
      if (statSync(path).mtimeMs !== mtime) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function scanDirectory(dir: string, results: Skill[], mtimes: Map<string, number>): void {
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
      const skillPath = join(fullPath, 'SKILL.md');
      if (existsSync(skillPath)) {
        try {
          const content = readFileSync(skillPath, 'utf-8');
          const skill = parseSkill(content, skillPath, basename(fullPath));
          results.push(skill);
          mtimes.set(skillPath, statSync(skillPath).mtimeMs);
        } catch {
          // Skip unparseable skills
        }
      } else {
        scanDirectory(fullPath, results, mtimes);
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
 *
 * Groups skills by their directory category (e.g., `english`, `support`)
 * and emits a compact category-level summary instead of listing every skill
 * with its full description. This reduces system prompt tokens by ~500
 * while preserving the LLM's ability to discover and route to skills.
 */
export function buildSkillIndex(): string {
  const skills = loadSkills();
  if (skills.length === 0) return '';

  // Group skills by category derived from directory path
  const categories = new Map<string, string[]>();
  for (const skill of skills) {
    // Extract category from filePath: .../skills/<category>/<name>/SKILL.md
    const parts = skill.filePath.split('/');
    const nameIdx = parts.lastIndexOf('SKILL.md');
    const category = nameIdx >= 3 ? parts[nameIdx - 2] : 'other';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category)!.push(skill.name);
  }

  const lines = ['## Available Skills\n'];
  lines.push('Use `skill_view` to load a skill\'s full procedure before first executing it. If `Active Skill Instructions` for that skill are already present in the system prompt, do not reload the same SKILL.md; continue the active workflow.\n');

  for (const [category, names] of categories) {
    lines.push(`- **${category}** (${names.length}): ${names.join(', ')}`);
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
