/**
 * @module lib/pidfile
 * @description UNIX-style Process ID (PID) management for background services.
 *
 * Implements locking and observability tracking for persistent applications
 * (e.g., the Telegram gateway), via local PID text files within `~/.anya/run/`.
 * Offers lifecycle mechanisms such as status inspection, stale file cleanup,
 * and automated graceful/force service termination signaling.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { RUN_DIR } from './paths.js';
import { join } from 'node:path';

/**
 * Resolves the absolute path to the PID file for a specified service.
 *
 * @param {string} service - The name of the service (e.g., 'gateway').
 * @returns {string} The computed filesystem path.
 */
function pidPath(service: string): string {
  return join(RUN_DIR, `${service}.pid`);
}

/**
 * Commits the current node process ID into a locked status file for the service.
 *
 * @param {string} service - The namespace of the operating service.
 */
export function writePid(service: string): void {
  writeFileSync(pidPath(service), String(process.pid), 'utf-8');
}

/**
 * Reads and parses the recorded process ID from a service's PID file.
 *
 * @param {string} service - The namespace of the service.
 * @returns {number | null} The active PID, or null if missing or malformed.
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
 * Safely removes the PID file associated with a target service.
 *
 * @param {string} service - The namespace of the service.
 */
export function removePid(service: string): void {
  const path = pidPath(service);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // Unlink might fail if already deleted, ignore safely
  }
}

/**
 * Determines if a target process ID is actively executing on the operating system.
 * Leverages the standard POSIX signal check trick via `kill(pid, 0)`.
 *
 * @param {number} pid - The OS process identifier.
 * @returns {boolean} True if the process exists in the OS run queue.
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
 * Evaluates the full operational state of a background service.
 * Automatically executes garbage collection on stale PID files if the process is dead.
 *
 * @param {string} service - The namespace of the service.
 * @returns {{ running: boolean; pid: number | null }} An object describing current process health.
 */
export function isServiceRunning(service: string): { running: boolean; pid: number | null } {
  const pid = readPid(service);
  if (pid === null) return { running: false, pid: null };

  if (isProcessRunning(pid)) {
    return { running: true, pid };
  }

  // Identify stale PID file (process crashed/killed externally), purge it
  removePid(service);
  return { running: false, pid: null };
}

/**
 * Attempts a coordinated shutdown of a running background service.
 * First issues a graceful `SIGTERM`, waiting up to a designated timeout.
 * If the process stubbornly persists, escalates to a strict `SIGKILL`.
 *
 * @param {string} service - The target service to terminate.
 * @param {number} [timeoutMs=3000] - Duration to await graceful exit before force killing.
 * @returns {Promise<boolean>} True if termination was executed (graceful or forced), false if not running.
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

  // Poll filesystem/OS until process gracefully exits
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (!isProcessRunning(pid)) {
      removePid(service);
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Process exceeded timeout window, escalate to harsh kill
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Ignore OS level kill exceptions at this phase
  }

  removePid(service);
  return true;
}
