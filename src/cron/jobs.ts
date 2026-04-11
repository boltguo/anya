import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CRON_JOBS_PATH } from '../lib/paths.js';

/**
 * A cron job definition.
 */
export interface CronJob {
  id: string;
  name: string;
  schedule: string; // cron expression (e.g. "0 9 * * *")
  prompt: string;
  deliver_to: 'cli' | 'telegram';
  attached_skills?: string[];
  enabled: boolean;
  created_at: string;
}

/**
 * Load all jobs from ~/.vela/cron/jobs.json.
 */
export function loadJobs(): CronJob[] {
  if (!existsSync(CRON_JOBS_PATH)) return [];

  try {
    const content = readFileSync(CRON_JOBS_PATH, 'utf-8');
    return JSON.parse(content) as CronJob[];
  } catch {
    return [];
  }
}

/**
 * Save jobs to ~/.vela/cron/jobs.json.
 */
export function saveJobs(jobs: CronJob[]): void {
  writeFileSync(CRON_JOBS_PATH, JSON.stringify(jobs, null, 2) + '\n', 'utf-8');
}

/**
 * Add a new job.
 */
export function addJob(job: CronJob): void {
  const jobs = loadJobs();
  jobs.push(job);
  saveJobs(jobs);
}

/**
 * Remove a job by ID.
 */
export function removeJob(id: string): boolean {
  const jobs = loadJobs();
  const filtered = jobs.filter(j => j.id !== id);
  if (filtered.length === jobs.length) return false;
  saveJobs(filtered);
  return true;
}

/**
 * Get a job by ID.
 */
export function getJob(id: string): CronJob | undefined {
  return loadJobs().find(j => j.id === id);
}

/**
 * Enable or disable a job.
 */
export function toggleJob(id: string, enabled: boolean): boolean {
  const jobs = loadJobs();
  const job = jobs.find(j => j.id === id);
  if (!job) return false;
  job.enabled = enabled;
  saveJobs(jobs);
  return true;
}
