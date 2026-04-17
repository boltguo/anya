import type { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { ANYA_HOME } from '../../src/lib/paths.js';

export function registerDataTransfer(program: Command): void {
  program
    .command('export <file>')
    .description('Export ~/.anya/ data')
    .action((file: string) => {
      execFileSync('tar', ['-czf', file, '-C', ANYA_HOME, '.'], { stdio: 'inherit' });
      console.log(`\n  [ok] Exported to ${file}\n`);
    });
}
