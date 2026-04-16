/**
 * @module tools/skill
 * @description Skill viewing tool — read-only access to installed skills.
 *
 * Skills are installed manually via `anya skills install` CLI.
 * The agent uses skill_view to read skill procedures before execution.
 */

import { register } from './registry.js';
import { getSkill, loadSkills, listSkillFiles, readSkillFile } from '../skills/loader.js';
import type { ToolContext } from '../agent/types.js';

register({
  name: 'skill_view',
  description: 'View a skill\'s full SKILL.md content (Level 1) or an attached file (Level 2). Use this before executing a skill\'s procedure.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Skill name to view',
      },
      file: {
        type: 'string',
        description: 'Optional: relative path to an attached file (Level 2). Omit to view SKILL.md (Level 1).',
      },
    },
    required: ['name'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const name = String(args.name).trim();
    const file = args.file ? String(args.file) : undefined;

    if (!file) {
      const skill = getSkill(name);
      if (!skill) {
        const all = loadSkills();
        if (all.length === 0) return `Error: Skill "${name}" not found. No skills are installed.`;
        const names = all.map(s => s.name).join(', ');
        return `Error: Skill "${name}" not found. Available skills: ${names}`;
      }

      const files = listSkillFiles(name);
      let result = skill.body;
      if (files.length > 0) {
        result += '\n\n---\nAttached files: ' + files.join(', ');
        result += '\nUse skill_view with file parameter to read them.';
      }
      return result;
    }

    const content = readSkillFile(name, file);
    if (content === null) {
      const files = listSkillFiles(name);
      if (files.length === 0) return `Error: Skill "${name}" has no attached files.`;
      return `Error: File "${file}" not found in skill "${name}". Available files: ${files.join(', ')}`;
    }

    return content;
  },
});
