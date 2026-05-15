// lib/pidfile.ts — service PID file management

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { RUN_DIR } from './paths.js';
import { join } from 'node:path';

const SERVICE_CMD_MATCHERS: Record<string, (cmd: string) => boolean> = {
  gateway: (cmd) => cmd.includes('anya') && cmd.includes('gateway') && cmd.includes('start'),
};

function pidPath(service: string): string {
  return join(RUN_DIR, `${service}.pid`);
}

export function writePid(service: string): void {
  writeFileSync(pidPath(service), String(process.pid), 'utf-8');
}

export function readPid(service: string): number | null {
  const path = pidPath(service);
  if (!existsSync(path)) return null;

  try {
    const pid = parseInt(readFileSync(path, 'utf-8').trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function removePid(service: string): void {
  const path = pidPath(service);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // Already deleted — ignore
  }
}

// POSIX signal 0 probes existence without sending a signal.
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getProcessCommand(pid: number): string | null {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

// PID-reuse guard: confirm the live PID actually belongs to this service.
function isServiceProcess(service: string, pid: number): boolean {
  const matcher = SERVICE_CMD_MATCHERS[service];
  if (!matcher) return true;
  const cmd = getProcessCommand(pid);
  return cmd !== null && matcher(cmd);
}

export function isServiceRunning(service: string): { running: boolean; pid: number | null } {
  const pid = readPid(service);
  if (pid === null) return { running: false, pid: null };

  if (isProcessRunning(pid) && isServiceProcess(service, pid)) {
    return { running: true, pid };
  }

  // Stale or PID-reused — clean up
  removePid(service);
  return { running: false, pid: null };
}

// Scan the process table for live instances of a service (excluding self).
export function findServiceProcesses(service: string, excludePid: number = process.pid): number[] {
  const matcher = SERVICE_CMD_MATCHERS[service];
  if (!matcher) return [];

  let raw: string;
  try {
    raw = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf-8' });
  } catch {
    return [];
  }

  const pids: number[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(' ');
    if (sep === -1) continue;
    const pid = parseInt(trimmed.slice(0, sep), 10);
    if (isNaN(pid) || pid === excludePid) continue;
    const cmd = trimmed.slice(sep + 1);
    if (matcher(cmd)) pids.push(pid);
  }
  return pids;
}

// SIGTERM then SIGKILL any stray service processes; wait until the table is clean.
export async function killStrayServiceProcesses(
  service: string,
  excludePid: number = process.pid,
  timeoutMs = 3000,
): Promise<number[]> {
  const initial = findServiceProcesses(service, excludePid);
  if (initial.length === 0) return [];

  for (const pid of initial) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* already dead */ }
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (findServiceProcesses(service, excludePid).length === 0) return initial;
    await new Promise(r => setTimeout(r, 100));
  }

  // Escalate
  for (const pid of findServiceProcesses(service, excludePid)) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
  }
  await new Promise(r => setTimeout(r, 200));
  return initial;
}

export async function stopService(service: string, timeoutMs = 3000): Promise<boolean> {
  const { running, pid } = isServiceRunning(service);
  if (!running || pid === null) return false;

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    removePid(service);
    return false;
  }

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (!isProcessRunning(pid)) {
      removePid(service);
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Escalate to SIGKILL after graceful timeout
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // ignore
  }

  removePid(service);
  return true;
}
