// skills/loader.ts — load SKILL.md from disk with mtime cache

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname, resolve, relative, sep } from 'node:path';
import { SKILLS_DIR } from '../lib/paths.js';
import { parseSkill, type Skill } from './parser.js';

interface SkillCache {
  skills: Skill[];
  // SKILL.md path → mtimeMs at load time
  mtimes: Map<string, number>;
}

let _cache: SkillCache | null = null;

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

// Adds/deletes are caught because new files aren't in the map and deleted-file stat throws.
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
          // skip unparseable skills
        }
      } else {
        scanDirectory(fullPath, results, mtimes);
      }
    }
  }
}

export function getSkill(name: string): Skill | undefined {
  const skills = loadSkills();
  return skills.find(s => s.name === name);
}

// Category-level summary cuts ~500 system-prompt tokens vs listing every skill description.
export function buildSkillIndex(): string {
  const skills = loadSkills();
  if (skills.length === 0) return '';

  const categories = new Map<string, string[]>();
  for (const skill of skills) {
    // filePath shape: .../skills/<category>/<name>/SKILL.md
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

export function readSkillFile(name: string, filePath: string): string | null {
  const skill = getSkill(name);
  if (!skill) return null;

  const skillDir = dirname(skill.filePath);
  const fullPath = resolve(skillDir, filePath);

  // Security: refuse paths escaping the skill directory.
  const rel = relative(skillDir, fullPath);
  if (rel.startsWith('..') || rel.startsWith('..' + sep)) return null;

  try {
    return readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

export function invalidateCache(): void {
  _cache = null;
}
