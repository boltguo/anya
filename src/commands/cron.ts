/**
 * @module commands/cron
 * @description `anya cron` — CLI manager for scheduled background jobs.
 *
 * Provides a command-line interface for interacting with the internal scheduling
 * mechanism. Allows users to list, create, update, pause, resume, remove, and
 * manually trigger cron jobs.
 */

import chalk from 'chalk';
import { Bot } from 'grammy';
import { loadConfig, saveConfig } from '../config/loader.js';
import {
  createJob,
  listJobs,
  pauseJob,
  removeJob,
  resumeJob,
  runJob,
  tick,
  updateJob,
  type CronJob,
  type SchedulerDelivery,
} from '../lib/scheduler.js';

/**
 * Executes `anya cron status`.
 * Displays the current global state of the cron scheduler, including
 * configuration parameters and the total number of registered jobs.
 */
export function runCronStatus(): void {
  const config = loadConfig();
  const jobs = listJobs();
  console.log(chalk.bold.cyan('\nAnya Cron\n'));
  console.log(`  Enabled:       ${config.cron.enabled ? chalk.green('yes') : chalk.dim('no')}`);
  console.log(`  Tick seconds:  ${config.cron.tick_seconds}`);
  console.log(`  Timezone:      ${config.cron.timezone}`);
  console.log(`  Default chat:  ${config.cron.default_chat_id || chalk.dim('(not set)')}`);
  console.log(`  Jobs:          ${jobs.length}\n`);
}

/**
 * Executes `anya cron list`.
 * Iterates through all registered cron jobs and displays their configuration
 * and current execution status.
 */
export function runCronList(): void {
  const jobs = listJobs();
  if (jobs.length === 0) {
    console.log('\n  No cron jobs.\n');
    return;
  }

  console.log(`\n  ${chalk.bold('Cron Jobs')}\n`);
  for (const job of jobs) printJob(job);
  console.log('');
}

/**
 * Executes `anya cron enable <boolean>`.
 * Toggles the global execution state of the cron scheduler.
 *
 * @param enabled - True to enable the scheduler, false to disable.
 */
export function runCronEnable(enabled: boolean): void {
  const config = loadConfig();
  config.cron.enabled = enabled;
  saveConfig(config);
  console.log(`\n  [ok] Cron ${enabled ? 'enabled' : 'disabled'}. Restart gateway for background ticking to apply.\n`);
}

/**
 * Executes `anya cron set-chat <chatId>`.
 * Sets the default Telegram chat ID where cron jobs will deliver proactive messages.
 *
 * @param chatId - The target Telegram chat ID.
 */
export function runCronSetChat(chatId: string): void {
  const config = loadConfig();
  config.cron.default_chat_id = chatId;
  saveConfig(config);
  console.log(`\n  [ok] cron.default_chat_id = ${chatId}\n`);
}

/**
 * Executes `anya cron set-tick <seconds>`.
 * Modifies the frequency of the internal polling tick.
 *
 * @param seconds - The polling interval in seconds (minimum 10).
 */
export function runCronSetTick(seconds: number): void {
  const config = loadConfig();
  config.cron.tick_seconds = Math.max(10, seconds);
  saveConfig(config);
  console.log(`\n  [ok] cron.tick_seconds = ${config.cron.tick_seconds}\n`);
}

/**
 * Executes `anya cron create`.
 * Instantiates a new scheduled job and saves it to the registry.
 *
 * @param opts - The configuration parameters for the new cron job.
 */
export function runCronCreate(opts: {
  name: string;
  prompt: string;
  schedule: string;
  chat?: string;
  repeat?: string;
  paused?: boolean;
}): void {
  const config = loadConfig();
  const job = createJob(config, {
    name: opts.name,
    prompt: opts.prompt,
    schedule: opts.schedule,
    chat_id: opts.chat,
    repeat_times: opts.repeat ? Number(opts.repeat) : undefined,
    enabled: !opts.paused,
  });
  console.log('\n  [ok] Created cron job\n');
  printJob(job);
  console.log('');
}

/**
 * Executes `anya cron update <id>`.
 * Modifies an existing scheduled job.
 *
 * @param id - The unique identifier of the job to update.
 * @param opts - The updated properties for the job.
 */
export function runCronUpdate(id: string, opts: {
  name?: string;
  prompt?: string;
  schedule?: string;
  chat?: string;
  repeat?: string;
}): void {
  const config = loadConfig();
  const job = updateJob(config, id, {
    name: opts.name,
    prompt: opts.prompt,
    schedule: opts.schedule,
    chat_id: opts.chat,
    repeat_times: opts.repeat ? Number(opts.repeat) : undefined,
  });
  console.log('\n  [ok] Updated cron job\n');
  printJob(job);
  console.log('');
}

/**
 * Executes `anya cron pause <id>`.
 * Suspends an active scheduled job.
 *
 * @param id - The unique identifier of the job to pause.
 */
export function runCronPause(id: string): void {
  const job = pauseJob(id);
  console.log(`\n  [ok] Paused ${job.id} ${job.name}\n`);
}

/**
 * Executes `anya cron resume <id>`.
 * Resumes a previously paused scheduled job.
 *
 * @param id - The unique identifier of the job to resume.
 */
export function runCronResume(id: string): void {
  const job = resumeJob(loadConfig(), id);
  console.log(`\n  [ok] Resumed ${job.id} ${job.name}\n`);
}

/**
 * Executes `anya cron remove <id>`.
 * Permanently deletes a scheduled job from the registry.
 *
 * @param id - The unique identifier of the job to remove.
 */
export function runCronRemove(id: string): void {
  const ok = removeJob(id);
  console.log(ok ? `\n  [ok] Removed ${id}\n` : `\n  Job not found: ${id}\n`);
}

/**
 * Executes `anya cron run <id>`.
 * Manually forces the immediate execution of a specific scheduled job, regardless
 * of its time schedule.
 *
 * @param id - The unique identifier of the job to execute.
 * @param deliver - Whether to actually deliver the resultant message to Telegram (default: true).
 * @returns A Promise resolving when the job execution completes.
 */
export async function runCronRun(id: string, deliver = true): Promise<void> {
  const config = loadConfig();
  const job = await runJob(config, id, deliver ? makeDelivery(config) : undefined);
  console.log(`\n  [ok] Ran ${job.id} ${job.name}: ${job.last_status}\n`);
}

/**
 * Executes `anya cron tick`.
 * Manually triggers the global polling tick to evaluate and execute any pending jobs.
 *
 * @param deliver - Whether to actually deliver resultant messages to Telegram (default: true).
 * @returns A Promise resolving when the tick cycle completes.
 */
export async function runCronTick(deliver = true): Promise<void> {
  const config = loadConfig();
  const result = await tick(config, deliver ? makeDelivery(config) : undefined);
  console.log(`\n  [ok] Tick complete. Ran ${result.ran} job(s).\n`);
}

/**
 * Constructs a \`SchedulerDelivery\` mechanism wrapping the Telegram Bot API.
 * Allows the scheduler to push proactive messages directly to chats.
 *
 * @param config - The loaded Anya configuration object.
 * @returns An initialized delivery interface, or undefined if Telegram is not configured.
 */
function makeDelivery(config = loadConfig()): SchedulerDelivery | undefined {
  if (!config.telegram?.bot_token) return undefined;
  const bot = new Bot(config.telegram.bot_token);
  return {
    async sendProactiveMessage(chatId: number, text: string): Promise<void> {
      await bot.api.sendMessage(chatId, text, {
        link_preview_options: { is_disabled: true },
      });
    },
  };
}

/**
 * Pretty-prints a job's details to the console.
 *
 * @param job - The CronJob entity to display.
 */
function printJob(job: CronJob): void {
  const state = job.enabled ? chalk.green(job.state) : chalk.dim(job.state);
  const next = job.next_run_at || chalk.dim('(none)');
  const repeat = job.repeat.times === null ? 'forever' : `${job.repeat.completed}/${job.repeat.times}`;
  console.log(`  ${chalk.cyan(job.id)}  ${chalk.bold(job.name)}  ${state}`);
  console.log(`    schedule: ${job.schedule.display}`);
  console.log(`    next:     ${next}`);
  console.log(`    deliver:  ${job.deliver.platform}:${job.deliver.chat_id}`);
  console.log(`    repeat:   ${repeat}`);
  if (job.last_status) console.log(`    last:     ${job.last_status}${job.last_error ? ` (${job.last_error})` : ''}`);
}
