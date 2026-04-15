import type { Command } from 'commander';

export function registerDataTransfer(program: Command): void {
  program
    .command('export <file>')
    .description('Export ~/.anya/ data')
    .option('--soul', 'Export soul layer only (config, memory, skills, cron)')
    .action(async (file: string, opts: { soul?: boolean }) => {
      const { execFileSync } = await import('node:child_process');
      const { ANYA_HOME } = await import('../../src/lib/paths.js');

      if (opts.soul) {
        try {
          execFileSync('tar', [
            '-czf', file, '-C', ANYA_HOME,
            'config.json', 'config.schema.json', 'memory/', 'skills/', 'cron/jobs.json',
          ], { stdio: 'inherit' });
        } catch {
          // Some paths may not exist — non-fatal
        }
      } else {
        execFileSync('tar', ['-czf', file, '-C', ANYA_HOME, '.'], { stdio: 'inherit' });
      }

      console.log(`\n  [ok] Exported to ${file}\n`);
    });

  program
    .command('import <file>')
    .description('Import from a backup')
    .action(async (file: string) => {
      const { execFileSync } = await import('node:child_process');
      const { ANYA_HOME, ensureDirectories } = await import('../../src/lib/paths.js');

      ensureDirectories();
      execFileSync('tar', ['-xzf', file, '-C', ANYA_HOME], { stdio: 'inherit' });
      console.log(`\n  [ok] Imported from ${file}\n`);
    });
}
