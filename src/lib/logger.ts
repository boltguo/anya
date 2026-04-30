/**
 * @module lib/logger
 * @description Structured JSON logging via pino.
 *
 * Creates separate logger instances for each service (agent, gateway, cron),
 * each writing to `~/.anya/logs/<service>.log`.
 *
 * Logs are append-only JSON lines. No rotation (daily volume is tiny).
 */

import pino from 'pino';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOGS_DIR } from './paths.js';

// Ensure logs directory exists before creating loggers
if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Create a pino logger for a specific service.
 * Logs to ~/.anya/logs/<service>.log as JSON lines.
 * Falls back to stderr-only if file transport fails.
 */
function createLogger(service: string, level: string = 'info'): pino.Logger {
  try {
    const dest = pino.destination({
      dest: join(LOGS_DIR, `${service}.log`),
      append: true,
      sync: true, // real-time write, volume is tiny
    });
    return pino({ level, name: service }, dest);
  } catch {
    // Fallback: log to stderr only
    return pino({ level, name: service });
  }
}

// Default log level -- will be overridden when config is loaded
let logLevel = 'info';

/**
 * Set the global log level (called after config is loaded).
 */
export function setLogLevel(level: string): void {
  logLevel = level;
  agentLogger.level = level;
  gatewayLogger.level = level;
  cronLogger.level = level;
}

// Per-service loggers
export const agentLogger = createLogger('agent', logLevel);
export const gatewayLogger = createLogger('gateway', logLevel);
export const cronLogger = createLogger('cron', logLevel);

