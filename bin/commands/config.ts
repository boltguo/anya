import type { Command } from 'commander';

export function registerConfig(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage configuration')
    .action(async () => {
      const { runConfigMenu } = await import('../../src/commands/config.js');
      await runConfigMenu();
    });

  configCmd
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      const { runConfigShow } = await import('../../src/commands/config.js');
      runConfigShow();
    });

  configCmd
    .command('edit')
    .description('Open config.json in $EDITOR')
    .action(async () => {
      const { execFileSync } = await import('node:child_process');
      const { CONFIG_PATH } = await import('../../src/lib/paths.js');
      const editor = process.env.EDITOR || 'vi';
      execFileSync(editor, [CONFIG_PATH], { stdio: 'inherit' });
    });
}
