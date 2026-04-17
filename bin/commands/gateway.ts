import type { Command } from 'commander';
import {
  runGatewayStart,
  runGatewayStop,
  runGatewayRestart,
  runGatewayStatus,
  runGatewayLogs,
} from '../../src/commands/gateway.js';

export function registerGateway(program: Command): void {
  const gatewayCmd = program
    .command('gateway')
    .description('Manage Telegram bot gateway');

  gatewayCmd
    .command('start')
    .description('Start the Telegram gateway')
    .option('--foreground', 'Run in foreground (for debugging)')
    .action(async (opts: { foreground?: boolean }) => {
      await runGatewayStart(opts.foreground);
    });

  gatewayCmd
    .command('stop')
    .description('Stop the Telegram gateway')
    .action(async () => {
      await runGatewayStop();
    });

  gatewayCmd
    .command('restart')
    .description('Restart the Telegram gateway')
    .action(async () => {
      await runGatewayRestart();
    });

  gatewayCmd
    .command('status')
    .description('Show gateway status')
    .action(() => {
      runGatewayStatus();
    });

  gatewayCmd
    .command('logs')
    .description('View gateway logs')
    .option('-n, --lines <n>', 'Number of lines to show', '50')
    .action((opts: { lines: string }) => {
      runGatewayLogs(parseInt(opts.lines, 10));
    });
}
