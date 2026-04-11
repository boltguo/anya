import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { register } from './registry.js';
import { SKILLS_DIR } from '../lib/paths.js';
import { getSkill, loadSkills, listSkillFiles, readSkillFile, invalidateCache } from '../skills/loader.js';
import type { ToolContext } from '../agent/types.js';

// --- skill_manage ---
register({
  name: 'skill_manage',
  description: 'Create, edit, patch, or delete skills in ~/.vela/skills/. Skills are markdown procedures that help you handle similar tasks in the future.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action to perform: "create", "edit" (full replace), "patch" (partial replace), "delete", or "add_file" (add template/script)',
        enum: ['create', 'edit', 'patch', 'delete', 'add_file'],
      },
      name: {
        type: 'string',
        description: 'Skill name (kebab-case, e.g. "react-debug")',
      },
      content: {
        type: 'string',
        description: 'Full SKILL.md content (for create/edit) or file content (for add_file)',
      },
      category: {
        type: 'string',
        description: 'Category subdirectory (e.g. "frontend", "devops"). Default: "general"',
      },
      old_string: {
        type: 'string',
        description: 'For "patch" action: the string to find in SKILL.md',
      },
      new_string: {
        type: 'string',
        description: 'For "patch" action: the replacement string',
      },
      file_path: {
        type: 'string',
        description: 'For "add_file" action: relative path within the skill directory (e.g. "templates/component.tsx")',
      },
    },
    required: ['action', 'name'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    const action = String(args.action);
    const name = String(args.name).trim();

    if (!name || name.includes('..') || name.includes('/')) {
      return 'Error: Invalid skill name. Use kebab-case without slashes.';
    }

    switch (action) {
      case 'create': {
        const content = String(args.content || '');
        const category = String(args.category || 'general');
        if (!content) return 'Error: Content is required for create.';

        const skillDir = join(SKILLS_DIR, category, name);
        const skillPath = join(skillDir, 'SKILL.md');

        if (existsSync(skillPath)) {
          return `Error: Skill "${name}" already exists. Use "edit" to modify it.`;
        }

        mkdirSync(skillDir, { recursive: true });
        writeFileSync(skillPath, content, 'utf-8');
        invalidateCache();
        return `Skill "${name}" created at ${skillPath}`;
      }

      case 'edit': {
        const content = String(args.content || '');
        if (!content) return 'Error: Content is required for edit.';

        const skill = getSkill(name);
        if (!skill) return `Error: Skill "${name}" not found.`;

        writeFileSync(skill.filePath, content, 'utf-8');
        invalidateCache();
        return `Skill "${name}" updated.`;
      }

      case 'patch': {
        const oldStr = String(args.old_string || '');
        const newStr = String(args.new_string || '');
        if (!oldStr) return 'Error: old_string is required for patch.';

        const skill = getSkill(name);
        if (!skill) return `Error: Skill "${name}" not found.`;

        const current = readFileSync(skill.filePath, 'utf-8');
        if (!current.includes(oldStr)) {
          return `Error: old_string not found in skill "${name}".`;
        }

        const updated = current.replace(oldStr, newStr);
        writeFileSync(skill.filePath, updated, 'utf-8');
        invalidateCache();
        return `Skill "${name}" patched.`;
      }

      case 'delete': {
        const skill = getSkill(name);
        if (!skill) return `Error: Skill "${name}" not found.`;

        const skillDir = dirname(skill.filePath);
        rmSync(skillDir, { recursive: true, force: true });
        invalidateCache();
        return `Skill "${name}" deleted.`;
      }

      case 'add_file': {
        const content = String(args.content || '');
        const filePath = String(args.file_path || '');
        if (!content || !filePath) return 'Error: content and file_path are required for add_file.';
        if (filePath.includes('..')) return 'Error: file_path must not contain "..".';

        const skill = getSkill(name);
        if (!skill) return `Error: Skill "${name}" not found. Create the skill first.`;

        const skillDir = dirname(skill.filePath);
        const targetPath = join(skillDir, filePath);

        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, content, 'utf-8');
        return `File "${filePath}" added to skill "${name}".`;
      }

      default:
        return `Error: Unknown action "${action}". Use create, edit, patch, delete, or add_file.`;
    }
  },
});

// --- skill_view ---
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
      // Level 1: return full SKILL.md
      const skill = getSkill(name);
      if (!skill) {
        // List available skills as a hint
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

    // Level 2: return attached file
    const content = readSkillFile(name, file);
    if (content === null) {
      const files = listSkillFiles(name);
      if (files.length === 0) return `Error: Skill "${name}" has no attached files.`;
      return `Error: File "${file}" not found in skill "${name}". Available files: ${files.join(', ')}`;
    }

    return content;
  },
});
