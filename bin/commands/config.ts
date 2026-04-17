import type { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { runConfigMenu, runConfigShow } from '../../src/commands/config.js';
import { CONFIG_PATH } from '../../src/lib/paths.js';

export function registerConfig(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage configuration')
    .action(async () => {
      await runConfigMenu();
    });

  configCmd
    .command('show')
    .description('Show current configuration')
    .action(() => {
      runConfigShow();
    });

  configCmd
    .command('edit')
    .description('Open config.json in $EDITOR')
    .action(() => {
      const editor = process.env.EDITOR || 'vi';
      execFileSync(editor, [CONFIG_PATH], { stdio: 'inherit' });
    });
}
