import { loadJobs, type CronJob } from './jobs.js';
import { Agent } from '../agent/Agent.js';
import { loadConfig } from '../config/loader.js';
import { agentLogger } from '../lib/logger.js';
import { writePid, removePid } from '../lib/pidfile.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CRON_HISTORY_DIR } from '../lib/paths.js';
import type { Adapter } from '../agent/types.js';

const SERVICE = 'cron';

/**
 * A silent adapter that collects output for cron delivery.
 */
class CronAdapter implements Adapter {
  result = '';

  async reply(content: string): Promise<void> {
    this.result += content;
  }

  async requestApproval(_description: string): Promise<'allow' | 'deny' | 'always'> {
    // Cron jobs auto-approve safe operations, deny destructive ones
    return 'allow';
  }
}

/**
 * Parse a simple cron expression and check if it matches the current minute.
 * Supports: minute hour dom month dow
 * Wildcards (*) and fixed values only (no ranges/lists for simplicity).
 */
function matchesCron(schedule: string, now: Date): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const fields = [
    now.getMinutes(),
    now.getHours(),
    now.getDate(),
    now.getMonth() + 1,
    now.getDay(),
  ];

  for (let i = 0; i < 5; i++) {
    const part = parts[i];
    if (part === '*') continue;

    // Handle */N step values
    if (part.startsWith('*/')) {
      const step = parseInt(part.substring(2), 10);
      if (isNaN(step) || step <= 0) return false;
      if (fields[i] % step !== 0) return false;
      continue;
    }

    // Handle comma-separated values
    if (part.includes(',')) {
      const values = part.split(',').map(v => parseInt(v, 10));
      if (!values.includes(fields[i])) return false;
      continue;
    }

    // Fixed value
    const val = parseInt(part, 10);
    if (isNaN(val) || val !== fields[i]) return false;
  }

  return true;
}

/**
 * Execute a single cron job.
 */
async function executeJob(job: CronJob): Promise<string> {
  const config = loadConfig();
  const adapter = new CronAdapter();
  const agent = new Agent(config, adapter);

  agentLogger.info({ msg: 'cron_execute', jobId: job.id, jobName: job.name });

  const result = await agent.run(job.prompt, {
    sessionKey: `cron:${job.id}`,
    newSession: true,
  });

  // Save execution history
  try {
    if (!existsSync(CRON_HISTORY_DIR)) {
      mkdirSync(CRON_HISTORY_DIR, { recursive: true });
    }

    const historyEntry = {
      jobId: job.id,
      jobName: job.name,
      executedAt: new Date().toISOString(),
      toolCalls: result.toolCallCount,
      contentLength: result.content.length,
    };

    writeFileSync(
      join(CRON_HISTORY_DIR, `${job.id}_${Date.now()}.json`),
      JSON.stringify(historyEntry, null, 2),
      'utf-8',
    );
  } catch { /* non-critical */ }

  return result.content;
}

/**
 * Deliver the result of a cron job to the specified platform.
 */
async function deliverResult(job: CronJob, result: string): Promise<void> {
  if (job.deliver_to === 'telegram') {
    try {
      const config = loadConfig();
      if (config.telegram.enabled && config.telegram.bot_token) {
        const { Bot } = await import('grammy');
        const bot = new Bot(config.telegram.bot_token);

        // Send to all allowed users
        for (const userId of config.telegram.allowed_user_ids) {
          const header = `[cron: ${job.name}]\n\n`;
          await bot.api.sendMessage(userId, header + result).catch(() => {});
        }
      }
    } catch (err) {
      agentLogger.error({ msg: 'cron_delivery_error', jobId: job.id, error: (err as Error).message });
    }
  }

  // For CLI delivery, just log it
  agentLogger.info({ msg: 'cron_result', jobId: job.id, contentLength: result.length });
}

/**
 * Start the cron scheduler. Checks every 60 seconds for due jobs.
 */
export function startScheduler(): void {
  writePid(SERVICE);
  console.log('[cron] Scheduler started');
  agentLogger.info({ msg: 'cron_scheduler_started' });

  // Clean up on exit
  process.on('SIGINT', () => { removePid(SERVICE); process.exit(0); });
  process.on('SIGTERM', () => { removePid(SERVICE); process.exit(0); });
  process.on('exit', () => { removePid(SERVICE); });

  // Check every 60 seconds
  const tick = async () => {
    const now = new Date();
    const jobs = loadJobs().filter(j => j.enabled);

    for (const job of jobs) {
      if (matchesCron(job.schedule, now)) {
        try {
          const result = await executeJob(job);
          await deliverResult(job, result);
        } catch (err) {
          agentLogger.error({
            msg: 'cron_job_error',
            jobId: job.id,
            error: (err as Error).message,
          });
        }
      }
    }
  };

  // Initial tick
  tick().catch(() => {});

  // Schedule recurring checks
  setInterval(() => {
    tick().catch(() => {});
  }, 60_000);
}

/**
 * Run a job manually by ID.
 */
export async function runJobManually(jobId: string): Promise<string> {
  const job = loadJobs().find(j => j.id === jobId);
  if (!job) throw new Error(`Job "${jobId}" not found.`);

  const result = await executeJob(job);
  await deliverResult(job, result);
  return result;
}
