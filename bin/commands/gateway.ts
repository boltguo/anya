import type { Command } from 'commander';

export function registerGateway(program: Command): void {
  const gatewayCmd = program
    .command('gateway')
    .description('Manage Telegram bot gateway');

  gatewayCmd
    .command('start')
    .description('Start the Telegram gateway')
    .option('--foreground', 'Run in foreground (for debugging)')
    .action(async (opts: { foreground?: boolean }) => {
      const { runGatewayStart } = await import('../../src/commands/gateway.js');
      await runGatewayStart(opts.foreground);
    });

  gatewayCmd
    .command('stop')
    .description('Stop the Telegram gateway')
    .action(async () => {
      const { runGatewayStop } = await import('../../src/commands/gateway.js');
      await runGatewayStop();
    });

  gatewayCmd
    .command('restart')
    .description('Restart the Telegram gateway')
    .action(async () => {
      const { runGatewayRestart } = await import('../../src/commands/gateway.js');
      await runGatewayRestart();
    });

  gatewayCmd
    .command('status')
    .description('Show gateway status')
    .action(async () => {
      const { runGatewayStatus } = await import('../../src/commands/gateway.js');
      runGatewayStatus();
    });

  gatewayCmd
    .command('logs')
    .description('View gateway logs')
    .option('-n, --lines <n>', 'Number of lines to show', '50')
    .action(async (opts: { lines: string }) => {
      const { runGatewayLogs } = await import('../../src/commands/gateway.js');
      runGatewayLogs(parseInt(opts.lines, 10));
    });
}
