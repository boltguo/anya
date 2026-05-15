// tools/cron.ts — scheduled-job agent interface

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';
import {
  createJob,
  getJob,
  listJobs,
  pauseJob,
  removeJob,
  resumeJob,
  runJob,
  tick,
  updateJob,
} from '../services/scheduler.js';

// Guards against prompt injection in unattended scheduled jobs.
const THREAT_PATTERNS = [
  /ignore\s+(?:previous|all|above|prior)\s+instructions/i,
  /system\s+prompt\s+override/i,
  /do\s+not\s+tell\s+the\s+user/i,
  /curl\s+[^\n]*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i,
  /wget\s+[^\n]*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i,
  /rm\s+-rf\s+\//i,
];

register({
  name: 'cron',
  description: 'Manage scheduled Anya jobs stored in ~/.anya/cron/jobs.json. Actions: create, list, update, pause, resume, remove, run, tick. Use for reminders, daily English pushes, weekly learner-state refreshes, and scheduled study tasks.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'create | list | update | pause | resume | remove | run | tick' },
      id: { type: 'string', description: 'Job id or job name for update/pause/resume/remove/run.' },
      name: { type: 'string', description: 'Human-readable job name.' },
      prompt: { type: 'string', description: 'Self-contained unattended prompt. Must not ask clarifying questions.' },
      schedule: { type: 'string', description: '30m, every 2h, ISO timestamp, or cron expression like 0 8 * * *.' },
      chat_id: { type: 'string', description: 'Telegram chat id for proactive delivery. Defaults to cron.default_chat_id.' },
      repeat_times: { type: 'integer', description: 'Optional maximum number of runs. Omit/null for forever on recurring jobs.' },
      enabled: { type: 'integer', description: '1 enabled, 0 paused. For create/update.' },
    },
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const action = String(args.action || 'list');

    try {
      switch (action) {
        case 'create': {
          const prompt = String(args.prompt || '');
          const blocked = scanPrompt(prompt);
          if (blocked) return JSON.stringify({ error: blocked });
          const job = createJob(context.config, {
            name: String(args.name || ''),
            prompt,
            schedule: String(args.schedule || ''),
            chat_id: args.chat_id ? String(args.chat_id) : undefined,
            repeat_times: args.repeat_times === undefined ? undefined : Number(args.repeat_times),
            enabled: args.enabled === undefined ? undefined : Number(args.enabled) === 1,
          });
          return JSON.stringify({ ok: true, job });
        }
        case 'list':
          return JSON.stringify({ ok: true, jobs: listJobs() });
        case 'update': {
          const id = String(args.id || '');
          if (!id) return JSON.stringify({ error: 'Missing id' });
          const prompt = args.prompt === undefined ? undefined : String(args.prompt);
          if (prompt) {
            const blocked = scanPrompt(prompt);
            if (blocked) return JSON.stringify({ error: blocked });
          }
          const job = updateJob(context.config, id, {
            name: args.name === undefined ? undefined : String(args.name),
            prompt,
            schedule: args.schedule === undefined ? undefined : String(args.schedule),
            chat_id: args.chat_id === undefined ? undefined : String(args.chat_id),
            repeat_times: args.repeat_times === undefined ? undefined : Number(args.repeat_times),
            enabled: args.enabled === undefined ? undefined : Number(args.enabled) === 1,
          });
          return JSON.stringify({ ok: true, job });
        }
        case 'pause':
          return JSON.stringify({ ok: true, job: pauseJob(String(args.id || '')) });
        case 'resume':
          return JSON.stringify({ ok: true, job: resumeJob(context.config, String(args.id || '')) });
        case 'remove':
          return JSON.stringify({ ok: removeJob(String(args.id || '')) });
        case 'run': {
          const job = await runJob(context.config, String(args.id || ''));
          return JSON.stringify({ ok: true, job });
        }
        case 'tick':
          return JSON.stringify({ ok: true, ...(await tick(context.config)) });
        case 'get':
          return JSON.stringify({ ok: true, job: getJob(String(args.id || '')) || null });
        default:
          return JSON.stringify({ error: `Unknown cron action: ${action}` });
      }
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
});

function scanPrompt(prompt: string): string {
  for (const pattern of THREAT_PATTERNS) {
    if (pattern.test(prompt)) {
      return 'Blocked: cron prompt contains unsafe unattended-execution instructions.';
    }
  }
  return '';
}

