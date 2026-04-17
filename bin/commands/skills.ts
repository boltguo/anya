import type { Command } from 'commander';

export function registerSkills(program: Command): void {
  const skillsCmd = program
    .command('skills')
    .description('Manage installed skills');

  skillsCmd
    .command('list')
    .description('List all installed skills')
    .action(async () => {
      const { loadSkills } = await import('../../src/skills/loader.js');
      const chalk = (await import('chalk')).default;
      const skills = loadSkills(true);

      if (skills.length === 0) {
        console.log('\n  No skills installed.');
        console.log('  Skills are created by the agent during conversations, or you can create them manually.\n');
        return;
      }

      console.log(`\n  ${chalk.bold('Installed Skills')} (${skills.length})\n`);

      for (const s of skills) {
        console.log(`    ${chalk.cyan(s.name)} - ${s.description}`);
      }
      console.log('');
    });

  skillsCmd
    .command('view <name>')
    .description('View a skill\'s full content')
    .action(async (name: string) => {
      const { getSkill, loadSkills, listSkillFiles } = await import('../../src/skills/loader.js');
      const chalk = (await import('chalk')).default;

      const skill = getSkill(name);
      if (!skill) {
        const all = loadSkills();
        console.error(`\n  Error: Skill "${name}" not found.`);
        if (all.length > 0) console.error(`  Available: ${all.map(s => s.name).join(', ')}`);
        console.log('');
        process.exit(1);
      }

      console.log(`\n  ${chalk.bold(skill.name)}`);
      console.log(`  ${chalk.dim(skill.description)}`);
      console.log(`  Path: ${chalk.dim(skill.filePath)}`);

      const files = listSkillFiles(name);
      if (files.length > 0) console.log(`  Attached: ${files.join(', ')}`);

      console.log(`\n${skill.body}\n`);
    });

  skillsCmd
    .command('create <name>')
    .description('Create a new empty skill template')
    .option('-c, --category <category>', 'Category subdirectory', 'general')
    .action(async (name: string, opts: { category: string }) => {
      const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { SKILLS_DIR } = await import('../../src/lib/paths.js');

      const skillDir = join(SKILLS_DIR, opts.category, name);
      const skillPath = join(skillDir, 'SKILL.md');

      if (existsSync(skillPath)) {
        console.error(`\n  Error: Skill "${name}" already exists at ${skillPath}\n`);
        process.exit(1);
      }

      const template = `---
name: ${name}
description: TODO - describe what this skill does
---

# When to Use

Describe the situations where this skill should be activated.

# Procedure

1. Step one
2. Step two
3. Step three

# Pitfalls

- Common mistake to avoid

# Verification

How to confirm the task was completed correctly.
`;

      mkdirSync(skillDir, { recursive: true });
      writeFileSync(skillPath, template, 'utf-8');

      console.log(`\n  [ok] Created skill template: ${skillPath}`);
      console.log(`  Edit the SKILL.md to fill in the procedure.\n`);
    });
}
