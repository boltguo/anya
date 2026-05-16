// services/scheduler.ts — cron job scheduler

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';
import { Agent } from '../agent/Agent.js';
import type { Adapter } from '../agent/types.js';
import type { AnyaConfig } from '../config/defaults.js';
import { ensureDirectories, CRON_DIR, CRON_JOBS_PATH, CRON_OUTPUT_DIR } from '../lib/paths.js';
import { agentLogger } from '../lib/logger.js';
import { registerAllTools } from '../tools/registry.js';

export type CronSchedule =
  | { kind: 'once'; run_at: string; display: string }
  | { kind: 'interval'; minutes: number; display: string }
  | { kind: 'cron'; expr: string; display: string };

export interface CronJob {
  id: string;
  name: string;
  prompt: string;
  schedule: CronSchedule;
  enabled: boolean;
  state: 'scheduled' | 'paused' | 'running' | 'completed' | 'error';
  deliver: {
    platform: string;
    chat_id: string;
  };
  repeat: {
    times: number | null;
    completed: number;
  };
  next_run_at: string | null;
  last_run_at?: string;
  last_status?: 'ok' | 'error' | 'silent';
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCronJobInput {
  name: string;
  prompt: string;
  schedule: string;
  chat_id?: string;
  repeat_times?: number | null;
  enabled?: boolean;
}

export interface SchedulerDelivery {
  sendProactiveMessage(chatId: number, text: string): Promise<void>;
}

let interval: NodeJS.Timeout | null = null;

const SILENT_MARKER = '[SILENT]';
const LOCK_DIR = join(CRON_DIR, '.tick.lock');

class CronAdapter implements Adapter {
  readonly platform = 'cron';
  private chunks: string[] = [];

  async reply(content: string): Promise<void> {
    if (content) this.chunks.push(content);
  }

  get content(): string {
    return this.chunks.join('\n\n').trim();
  }
}

export function startScheduler(config: AnyaConfig, delivery: SchedulerDelivery): void {
  if (!config.cron?.enabled) return;
  if (interval) return;

  const tickMs = Math.max(10, Number(config.cron.tick_seconds || 60)) * 1000;
  agentLogger.info({ msg: 'cron_scheduler_start', tick_ms: tickMs });

  interval = setInterval(() => {
    tick(config, delivery).catch((err) => {
      agentLogger.error({ msg: 'cron_tick_error', error: (err as Error).message });
    });
  }, tickMs);
  interval.unref();

  tick(config, delivery).catch((err) => {
    agentLogger.error({ msg: 'cron_initial_tick_error', error: (err as Error).message });
  });
}

export function stopScheduler(): void {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}

export function listJobs(): CronJob[] {
  return loadJobs();
}

export function getJob(id: string): CronJob | undefined {
  return loadJobs().find(job => job.id === id || job.name === id);
}

export function createJob(config: AnyaConfig, input: CreateCronJobInput): CronJob {
  const now = new Date();
  const schedule = parseSchedule(input.schedule, config);
  const job: CronJob = {
    id: randomUUID().replace(/-/g, '').slice(0, 12),
    name: input.name.trim(),
    prompt: input.prompt.trim(),
    schedule,
    enabled: input.enabled ?? true,
    state: input.enabled === false ? 'paused' : 'scheduled',
    deliver: {
      platform: 'telegram',
      chat_id: String(input.chat_id || config.cron?.default_chat_id || ''),
    },
    repeat: {
      times: input.repeat_times === undefined ? null : input.repeat_times,
      completed: 0,
    },
    next_run_at: input.enabled === false ? null : computeNextRun(schedule, config, now),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  if (!job.name) throw new Error('Missing cron job name');
  if (!job.prompt) throw new Error('Missing cron job prompt');
  if (!job.deliver.chat_id) throw new Error('Missing cron delivery chat_id. Set cron.default_chat_id or pass chat_id.');

  const jobs = loadJobs();
  jobs.push(job);
  saveJobs(jobs);
  return job;
}

export function updateJob(config: AnyaConfig, id: string, patch: Partial<CreateCronJobInput>): CronJob {
  const jobs = loadJobs();
  const idx = jobs.findIndex(job => job.id === id || job.name === id);
  if (idx === -1) throw new Error(`Cron job not found: ${id}`);

  const now = new Date();
  const job = { ...jobs[idx] };
  if (patch.name !== undefined) job.name = patch.name.trim();
  if (patch.prompt !== undefined) job.prompt = patch.prompt.trim();
  if (patch.chat_id !== undefined) job.deliver = { platform: 'telegram', chat_id: patch.chat_id };
  if (patch.repeat_times !== undefined) job.repeat = { ...job.repeat, times: patch.repeat_times };
  if (patch.schedule !== undefined) {
    job.schedule = parseSchedule(patch.schedule, config);
    job.next_run_at = job.enabled ? computeNextRun(job.schedule, config, now) : null;
  }
  if (patch.enabled !== undefined) {
    job.enabled = patch.enabled;
    job.state = patch.enabled ? 'scheduled' : 'paused';
    job.next_run_at = patch.enabled ? computeNextRun(job.schedule, config, now) : null;
  }
  job.updated_at = now.toISOString();

  jobs[idx] = job;
  saveJobs(jobs);
  return job;
}

export function pauseJob(id: string): CronJob {
  const jobs = loadJobs();
  const job = requireJob(jobs, id);
  job.enabled = false;
  job.state = 'paused';
  job.next_run_at = null;
  job.updated_at = new Date().toISOString();
  saveJobs(jobs);
  return job;
}

export function resumeJob(config: AnyaConfig, id: string): CronJob {
  const jobs = loadJobs();
  const job = requireJob(jobs, id);
  job.enabled = true;
  job.state = 'scheduled';
  job.next_run_at = computeNextRun(job.schedule, config, new Date());
  job.updated_at = new Date().toISOString();
  saveJobs(jobs);
  return job;
}

export function removeJob(id: string): boolean {
  const jobs = loadJobs();
  const next = jobs.filter(job => job.id !== id && job.name !== id);
  if (next.length === jobs.length) return false;
  saveJobs(next);
  return true;
}

export async function tick(config: AnyaConfig, delivery?: SchedulerDelivery): Promise<{ ran: number; jobs: CronJob[] }> {
  return withTickLock(async () => {
    const now = new Date();
    const jobs = loadJobs();
    const due = jobs.filter(job =>
      job.enabled &&
      job.state === 'scheduled' &&
      job.next_run_at &&
      new Date(job.next_run_at).getTime() <= now.getTime()
    );

    for (const job of due) {
      await runJob(config, job.id, delivery);
    }

    return { ran: due.length, jobs: loadJobs() };
  });
}

export async function runJob(config: AnyaConfig, id: string, delivery?: SchedulerDelivery): Promise<CronJob> {
  const jobs = loadJobs();
  const job = requireJob(jobs, id);
  if (!job.deliver.chat_id) throw new Error(`Cron job ${job.id} has no delivery chat_id`);

  const startedAt = new Date();
  job.state = 'running';
  job.updated_at = startedAt.toISOString();
  saveJobs(jobs);

  try {
    const output = await runAgentForJob(config, job);
    const status: 'ok' | 'silent' = output.startsWith(SILENT_MARKER) ? 'silent' : 'ok';

    if (status === 'ok' && delivery) {
      await delivery.sendProactiveMessage(Number(job.deliver.chat_id), output);
    }

    saveOutput(job, output || SILENT_MARKER);
    finishRun(config, job.id, status, undefined, startedAt);
  } catch (err) {
    const message = (err as Error).message;
    saveOutput(job, `ERROR: ${message}`);
    finishRun(config, job.id, 'error', message, startedAt);
  }

  return requireJob(loadJobs(), id);
}

async function runAgentForJob(config: AnyaConfig, job: CronJob): Promise<string> {
  await registerAllTools();

  const adapter = new CronAdapter();
  const agent = new Agent(config, adapter);
  const prompt = [
    '[SYSTEM: Cron job execution. This is unattended. Do not ask clarifying questions. If there is nothing useful to send, respond exactly with [SILENT].]',
    `[Cron job: ${job.name}]`,
    job.prompt,
  ].join('\n\n');

  const result = await agent.run(prompt, {
    sessionKey: `cron:${job.id}:${Date.now()}`,
    newSession: true,
    toolPolicy: {
      deny: ['cron', 'tg_msg', 'clarify'],
    },
  });

  return (adapter.content || result.content || '').trim();
}

function finishRun(
  config: AnyaConfig,
  id: string,
  status: 'ok' | 'silent' | 'error',
  error: string | undefined,
  startedAt: Date,
): void {
  const jobs = loadJobs();
  const job = requireJob(jobs, id);
  const now = new Date();

  job.repeat.completed += 1;
  job.last_run_at = startedAt.toISOString();
  job.last_status = status;
  job.last_error = error || '';
  job.updated_at = now.toISOString();

  const exhausted = job.repeat.times !== null && job.repeat.completed >= job.repeat.times;
  if (exhausted || job.schedule.kind === 'once') {
    job.state = 'completed';
    job.enabled = false;
    job.next_run_at = null;
  } else {
    job.state = 'scheduled';
    job.next_run_at = computeNextRun(job.schedule, config, now);
  }

  saveJobs(jobs);
}

export function parseSchedule(schedule: string, config: AnyaConfig): CronSchedule {
  const text = schedule.trim();
  const lower = text.toLowerCase();

  if (lower.startsWith('every ')) {
    const minutes = parseDurationMinutes(text.slice(6));
    return { kind: 'interval', minutes, display: `every ${minutes}m` };
  }

  if (isCronExpression(text)) {
    CronExpressionParser.parse(text, { currentDate: new Date(), tz: config.cron?.timezone || 'UTC' });
    return { kind: 'cron', expr: text, display: text };
  }

  if (text.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid schedule timestamp: ${text}`);
    return { kind: 'once', run_at: date.toISOString(), display: `once at ${date.toISOString()}` };
  }

  const minutes = parseDurationMinutes(text);
  const runAt = new Date(Date.now() + minutes * 60_000).toISOString();
  return { kind: 'once', run_at: runAt, display: `once in ${text}` };
}

function computeNextRun(schedule: CronSchedule, config: AnyaConfig, from: Date): string | null {
  if (schedule.kind === 'once') return schedule.run_at;
  if (schedule.kind === 'interval') return new Date(from.getTime() + schedule.minutes * 60_000).toISOString();

  const interval = CronExpressionParser.parse(schedule.expr, {
    currentDate: from,
    tz: config.cron?.timezone || 'UTC',
  });
  return interval.next().toDate().toISOString();
}

function isCronExpression(text: string): boolean {
  const parts = text.split(/\s+/);
  return (parts.length === 5 || parts.length === 6) && parts.every(part => /^[\d*?,/\-A-Za-z#LW]+$/.test(part));
}

function parseDurationMinutes(text: string): number {
  const match = text.trim().toLowerCase().match(/^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/);
  if (!match) {
    throw new Error(`Invalid schedule "${text}". Use "30m", "every 2h", ISO timestamp, or cron expression.`);
  }
  const value = Number(match[1]);
  const unit = match[2][0];
  const multiplier = unit === 'd' ? 1440 : unit === 'h' ? 60 : 1;
  return value * multiplier;
}

function loadJobs(): CronJob[] {
  ensureCronFiles();
  try {
    const raw = readFileSync(CRON_JOBS_PATH, 'utf-8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as CronJob[] : [];
  } catch {
    return [];
  }
}

function saveJobs(jobs: CronJob[]): void {
  ensureCronFiles();
  const tmp = `${CRON_JOBS_PATH}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(jobs, null, 2) + '\n', 'utf-8');
  try { chmodOwnerOnly(tmp); } catch { /* ignore */ }
  renameSync(tmp, CRON_JOBS_PATH);
  try { chmodOwnerOnly(CRON_JOBS_PATH); } catch { /* ignore */ }
}

function ensureCronFiles(): void {
  ensureDirectories();
  if (!existsSync(CRON_JOBS_PATH)) {
    writeFileSync(CRON_JOBS_PATH, '[]\n', 'utf-8');
    chmodOwnerOnly(CRON_JOBS_PATH);
  }
}

function chmodOwnerOnly(path: string): void {
  try {
    chmodSync(path, 0o600);
  } catch { /* non-posix */ }
}

function requireJob(jobs: CronJob[], id: string): CronJob {
  const job = jobs.find(item => item.id === id || item.name === id);
  if (!job) throw new Error(`Cron job not found: ${id}`);
  return job;
}

function saveOutput(job: CronJob, output: string): void {
  mkdirSync(CRON_OUTPUT_DIR, { recursive: true });
  const jobDir = join(CRON_OUTPUT_DIR, job.id);
  mkdirSync(jobDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(jobDir, `${stamp}.md`), output + '\n', 'utf-8');
}

// Filesystem mkdir is atomic — used as cross-process mutex for tick.
async function withTickLock<T>(fn: () => Promise<T>): Promise<T> {
  mkdirSync(CRON_DIR, { recursive: true });
  try {
    mkdirSync(LOCK_DIR);
  } catch {
    if (isStaleLock()) {
      rmSync(LOCK_DIR, { recursive: true, force: true });
      mkdirSync(LOCK_DIR);
    } else {
      return { ran: 0, jobs: loadJobs() } as T;
    }
  }

  try {
    return await fn();
  } finally {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}

function isStaleLock(): boolean {
  try {
    const ageMs = Date.now() - statSync(LOCK_DIR).mtimeMs;
    return ageMs > 10 * 60_000;
  } catch {
    return true;
  }
}
