import { Command } from 'commander';
import chalk from 'chalk';
import { loadSkills, getSkill, listSkillFiles } from '../skills/loader.js';

export const skillsCommand = new Command('skills')
  .description('Manage installed skills');

// --- anya skills list ---
skillsCommand
  .command('list')
  .description('List all installed skills')
  .action(() => {
    const skills = loadSkills(true);

    if (skills.length === 0) {
      console.log('\n  No skills installed.');
      console.log('  Skills are created by the agent during conversations, or you can create them manually.\n');
      return;
    }

    console.log(`\n  ${chalk.bold('Installed Skills')} (${skills.length})\n`);

    // Group by category
    const byCategory = new Map<string, typeof skills>();
    for (const skill of skills) {
      const cat = skill.category || 'general';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(skill);
    }

    for (const [category, catSkills] of byCategory) {
      console.log(`  ${chalk.dim(category + '/')}`);
      for (const s of catSkills) {
        const tags = s.tags.length > 0 ? chalk.dim(` [${s.tags.join(', ')}]`) : '';
        console.log(`    ${chalk.cyan(s.name)} - ${s.description}${tags}`);
      }
    }

    console.log('');
  });

// --- anya skills view <name> ---
skillsCommand
  .command('view <name>')
  .description('View a skill\'s full SKILL.md content')
  .action((name: string) => {
    const skill = getSkill(name);
    if (!skill) {
      const all = loadSkills();
      console.error(`\n  Error: Skill "${name}" not found.`);
      if (all.length > 0) {
        console.error(`  Available: ${all.map(s => s.name).join(', ')}`);
      }
      console.log('');
      process.exit(1);
    }

    console.log(`\n  ${chalk.bold(skill.name)} v${skill.version}`);
    console.log(`  ${chalk.dim(skill.description)}`);
    if (skill.tags.length > 0) {
      console.log(`  Tags: ${skill.tags.join(', ')}`);
    }
    console.log(`  Path: ${chalk.dim(skill.filePath)}`);

    const files = listSkillFiles(name);
    if (files.length > 0) {
      console.log(`  Attached: ${files.join(', ')}`);
    }

    console.log(`\n${skill.body}\n`);
  });

// --- anya skills create <name> ---
skillsCommand
  .command('create <name>')
  .description('Create a new empty skill template')
  .option('-c, --category <category>', 'Category subdirectory', 'general')
  .action(async (name: string, opts: { category: string }) => {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { SKILLS_DIR } = await import('../lib/paths.js');

    const skillDir = join(SKILLS_DIR, opts.category, name);
    const skillPath = join(skillDir, 'SKILL.md');

    if (existsSync(skillPath)) {
      console.error(`\n  Error: Skill "${name}" already exists at ${skillPath}\n`);
      process.exit(1);
    }

    const template = `---
name: ${name}
description: TODO - describe what this skill does
version: 1.0.0
tags: []
category: ${opts.category}
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
