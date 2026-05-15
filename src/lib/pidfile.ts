// lib/pidfile.ts — service PID file management

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { RUN_DIR } from './paths.js';
import { join } from 'node:path';

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

export function isServiceRunning(service: string): { running: boolean; pid: number | null } {
  const pid = readPid(service);
  if (pid === null) return { running: false, pid: null };

  if (isProcessRunning(pid)) {
    return { running: true, pid };
  }

  // Stale PID file (process died externally) — clean up
  removePid(service);
  return { running: false, pid: null };
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
