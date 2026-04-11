import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { RUN_DIR } from './paths.js';
import { join } from 'node:path';

/**
 * Get the PID file path for a service.
 */
function pidPath(service: string): string {
  return join(RUN_DIR, `${service}.pid`);
}

/**
 * Write the current process PID to a file.
 */
export function writePid(service: string): void {
  writeFileSync(pidPath(service), String(process.pid), 'utf-8');
}

/**
 * Read the PID from a file, or null if not found.
 */
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

/**
 * Remove the PID file for a service.
 */
export function removePid(service: string): void {
  const path = pidPath(service);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch { /* ignore */ }
}

/**
 * Check if a process with the given PID is running.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a service is running.
 * Cleans up stale PID files.
 */
export function isServiceRunning(service: string): { running: boolean; pid: number | null } {
  const pid = readPid(service);
  if (pid === null) return { running: false, pid: null };

  if (isProcessRunning(pid)) {
    return { running: true, pid };
  }

  // Stale PID file -- process is not running
  removePid(service);
  return { running: false, pid: null };
}

/**
 * Stop a service by sending SIGTERM, then SIGKILL after timeout.
 */
export async function stopService(service: string, timeoutMs = 3000): Promise<boolean> {
  const { running, pid } = isServiceRunning(service);
  if (!running || pid === null) return false;

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    removePid(service);
    return false;
  }

  // Wait for the process to exit
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (!isProcessRunning(pid)) {
      removePid(service);
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Force kill
  try {
    process.kill(pid, 'SIGKILL');
  } catch { /* ignore */ }

  removePid(service);
  return true;
}
