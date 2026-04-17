import type { Command } from 'commander';
import chalk from 'chalk';
import { input as promptInput } from '@inquirer/prompts';
import { startScheduler, runJobManually } from '../../src/cron/scheduler.js';
import { stopService, isServiceRunning } from '../../src/lib/pidfile.js';
import { loadJobs, addJob, removeJob } from '../../src/cron/jobs.js';

export function registerCron(program: Command): void {
  const cronCmd = program
    .command('cron')
    .description('Manage cron jobs');

  cronCmd
    .command('start')
    .description('Start the cron scheduler')
    .action(async () => {
      await startScheduler();
    });

  cronCmd
    .command('stop')
    .description('Stop the cron scheduler')
    .action(async () => {
      const stopped = await stopService('cron');
      console.log(stopped ? '\n  [ok] Cron stopped.\n' : '\n  Cron is not running.\n');
    });

  cronCmd
    .command('status')
    .description('Show cron scheduler status')
    .action(() => {
      const { running, pid } = isServiceRunning('cron');
      if (running) {
        console.log(`\n  Cron: ${chalk.green('running')} (PID ${pid})\n`);
      } else {
        console.log(`\n  Cron: ${chalk.dim('stopped')}\n`);
      }
    });

  cronCmd
    .command('list')
    .description('List all cron jobs')
    .action(() => {
      const jobs = loadJobs();

      if (jobs.length === 0) {
        console.log('\n  No cron jobs configured.');
        console.log('  Use "anya cron add" to create one.\n');
        return;
      }

      console.log(`\n  ${chalk.bold('Cron Jobs')} (${jobs.length})\n`);
      for (const job of jobs) {
        const status = job.enabled ? chalk.green('on') : chalk.dim('off');
        console.log(`  [${status}] ${chalk.cyan(job.id)} - ${job.name}`);
        console.log(`       ${chalk.dim(job.schedule)} -> ${job.deliver_to}`);
      }
      console.log('');
    });

  cronCmd
    .command('add')
    .description('Add a new cron job')
    .action(async () => {
      const id = await promptInput({ message: 'Job ID (kebab-case):' });
      const name = await promptInput({ message: 'Job name:' });
      const schedule = await promptInput({ message: 'Cron schedule (e.g. "0 9 * * *"):' });
      const prompt = await promptInput({ message: 'Prompt for the agent:' });
      const deliverTo = await promptInput({ message: 'Deliver to (cli/telegram):', default: 'telegram' });

      addJob({
        id: id.trim(),
        name: name.trim(),
        schedule: schedule.trim(),
        prompt: prompt.trim(),
        deliver_to: deliverTo.trim() as 'cli' | 'telegram',
        enabled: true,
        created_at: new Date().toISOString(),
      });

      console.log(`\n  [ok] Job "${id.trim()}" added.\n`);
    });

  cronCmd
    .command('remove <id>')
    .description('Remove a cron job')
    .action((id: string) => {
      const removed = removeJob(id);
      console.log(removed ? `\n  [ok] Job "${id}" removed.\n` : `\n  Job "${id}" not found.\n`);
    });

  cronCmd
    .command('run <id>')
    .description('Run a cron job manually')
    .action(async (id: string) => {
      try {
        console.log(chalk.dim(`\n  Running job "${id}"...\n`));
        const result = await runJobManually(id);
        console.log(result);
        console.log('');
      } catch (err) {
        console.error(`\n  Error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}
