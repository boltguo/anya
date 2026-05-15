// commands/cron.ts — CLI for scheduled background jobs

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

export function runCronEnable(enabled: boolean): void {
  const config = loadConfig();
  config.cron.enabled = enabled;
  saveConfig(config);
  console.log(`\n  [ok] Cron ${enabled ? 'enabled' : 'disabled'}. Restart gateway for background ticking to apply.\n`);
}

export function runCronSetChat(chatId: string): void {
  const config = loadConfig();
  config.cron.default_chat_id = chatId;
  saveConfig(config);
  console.log(`\n  [ok] cron.default_chat_id = ${chatId}\n`);
}

export function runCronSetTick(seconds: number): void {
  const config = loadConfig();
  config.cron.tick_seconds = Math.max(10, seconds);  // floor: 10s
  saveConfig(config);
  console.log(`\n  [ok] cron.tick_seconds = ${config.cron.tick_seconds}\n`);
}

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

export function runCronPause(id: string): void {
  const job = pauseJob(id);
  console.log(`\n  [ok] Paused ${job.id} ${job.name}\n`);
}

export function runCronResume(id: string): void {
  const job = resumeJob(loadConfig(), id);
  console.log(`\n  [ok] Resumed ${job.id} ${job.name}\n`);
}

export function runCronRemove(id: string): void {
  const ok = removeJob(id);
  console.log(ok ? `\n  [ok] Removed ${id}\n` : `\n  Job not found: ${id}\n`);
}

export async function runCronRun(id: string, deliver = true): Promise<void> {
  const config = loadConfig();
  const job = await runJob(config, id, deliver ? makeDelivery(config) : undefined);
  console.log(`\n  [ok] Ran ${job.id} ${job.name}: ${job.last_status}\n`);
}

export async function runCronTick(deliver = true): Promise<void> {
  const config = loadConfig();
  const result = await tick(config, deliver ? makeDelivery(config) : undefined);
  console.log(`\n  [ok] Tick complete. Ran ${result.ran} job(s).\n`);
}

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
