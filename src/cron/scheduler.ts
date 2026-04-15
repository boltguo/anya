/**
 * @module cron/scheduler
 * @description Cron scheduler driven by the `croner` library.
 *
 * Each enabled job is registered as its own `Cron` instance — croner owns the
 * scheduling loop, timezone handling, and next-run calculations. We periodically
 * re-sync with the jobs file so that adds/removes/schedule changes take effect
 * without a restart.
 */
import { Cron } from 'croner';
import { loadJobs, type CronJob } from './jobs.js';
import { Agent } from '../agent/Agent.js';
import { registerAllTools } from '../tools/registry.js';
import { loadConfig } from '../config/loader.js';
import { agentLogger } from '../lib/logger.js';
import { writePid, removePid } from '../lib/pidfile.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CRON_HISTORY_DIR } from '../lib/paths.js';
import type { Adapter } from '../agent/types.js';
import { getOrCreateSession, saveMessages } from '../storage/sessionStore.js';

const SERVICE = 'cron';
const SYNC_INTERVAL_MS = 60_000;

/** Active Cron instances keyed by job id. */
const activeCrons = new Map<string, { cron: Cron; schedule: string }>();

/**
 * A silent adapter that collects output for cron delivery.
 */
class CronAdapter implements Adapter {
  readonly platform = 'cron' as const;
  result = '';

  async reply(content: string): Promise<void> {
    if (this.result && !this.result.endsWith('\n')) this.result += '\n\n';
    this.result += content;
  }

  async requestApproval(_description: string): Promise<'allow' | 'deny' | 'always'> {
    return 'allow';
  }
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

        for (const userId of config.telegram.allowed_user_ids) {
          const header = `[cron: ${job.name}]\n\n`;
          await bot.api.sendMessage(userId, header + result).catch(() => {});

          try {
            const sessionKey = `tg:${userId}`;
            const sessionId = getOrCreateSession(sessionKey);
            saveMessages(sessionId, [
              { role: 'user', content: `[定时任务: ${job.name}]` },
              { role: 'assistant', content: header + result },
            ]);
          } catch (e) {
            agentLogger.error({ msg: 'cron_memory_link_error', error: (e as Error).message });
          }
        }
      }
    } catch (err) {
      agentLogger.error({ msg: 'cron_delivery_error', jobId: job.id, error: (err as Error).message });
    }
  }

  agentLogger.info({ msg: 'cron_result', jobId: job.id, contentLength: result.length });
}

/**
 * Build a fresh closure for this job id so schedule/prompt changes pick up
 * at the next sync without stale references.
 */
function buildHandler(jobId: string): () => Promise<void> {
  return async () => {
    const job = loadJobs().find(j => j.id === jobId && j.enabled);
    if (!job) return;
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
  };
}

/**
 * Reconcile registered Cron instances with the on-disk jobs file.
 * Stops removed/disabled jobs; (re)registers new or schedule-changed jobs.
 */
function syncJobs(): void {
  let jobs: CronJob[];
  try {
    jobs = loadJobs().filter(j => j.enabled);
  } catch (err) {
    agentLogger.error({ msg: 'cron_sync_load_error', error: (err as Error).message });
    return;
  }

  const liveIds = new Set(jobs.map(j => j.id));

  for (const [id, entry] of activeCrons) {
    if (!liveIds.has(id)) {
      entry.cron.stop();
      activeCrons.delete(id);
    }
  }

  for (const job of jobs) {
    const existing = activeCrons.get(job.id);
    if (existing && existing.schedule === job.schedule) continue;
    if (existing) existing.cron.stop();

    try {
      const cron = new Cron(job.schedule, buildHandler(job.id));
      activeCrons.set(job.id, { cron, schedule: job.schedule });
    } catch (err) {
      agentLogger.error({
        msg: 'cron_invalid_schedule',
        jobId: job.id,
        schedule: job.schedule,
        error: (err as Error).message,
      });
    }
  }
}

/**
 * Start the cron scheduler. Registers one Cron per enabled job and re-syncs
 * periodically so edits to the jobs file take effect without a restart.
 */
export async function startScheduler(): Promise<void> {
  await registerAllTools();
  writePid(SERVICE);
  console.log('[cron] Scheduler started');
  agentLogger.info({ msg: 'cron_scheduler_started' });

  const shutdown = () => {
    for (const { cron } of activeCrons.values()) cron.stop();
    activeCrons.clear();
    removePid(SERVICE);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => { removePid(SERVICE); });

  syncJobs();
  setInterval(syncJobs, SYNC_INTERVAL_MS);
}

/**
 * Run a job manually by ID.
 */
export async function runJobManually(jobId: string): Promise<string> {
  await registerAllTools();
  const job = loadJobs().find(j => j.id === jobId);
  if (!job) throw new Error(`Job "${jobId}" not found.`);

  const result = await executeJob(job);
  await deliverResult(job, result);
  return result;
}
