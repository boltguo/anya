/**
 * @module lib/logger
 * @description Structured JSON logging using pino.
 *
 * Creates distinct logger instances for core services (e.g., agent, gateway),
 * directing output to `~/.anya/logs/<service>.log`.
 *
 * Log entries are formatted as append-only JSON lines.
 */

import pino from 'pino';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOGS_DIR } from './paths.js';

// Ensure the logs directory is present prior to logger instantiation
if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Creates a structured pino logger instance for a designated service.
 * Appends JSON-formatted log lines to `~/.anya/logs/<service>.log`.
 * Gracefully degrades to stderr output if file transport encounters an error.
 *
 * @param {string} service - The name of the service (e.g., 'agent', 'gateway').
 * @param {string} [level='info'] - The initial logging level.
 * @returns {pino.Logger} The configured pino logger instance.
 */
function createLogger(service: string, level: string = 'info'): pino.Logger {
  try {
    const dest = pino.destination({
      dest: join(LOGS_DIR, `${service}.log`),
      append: true,
      sync: true, // Write synchronously, acceptable for low-volume logging
    });
    return pino({ level, name: service }, dest);
  } catch {
    // Fallback: direct output to stderr
    return pino({ level, name: service });
  }
}

// Global log level, subject to override upon configuration loading
let logLevel = 'info';

/**
 * Updates the logging level across all service loggers.
 * Typically invoked after loading application configuration.
 *
 * @param {string} level - The desired log level (e.g., 'debug', 'info', 'warn', 'error').
 */
export function setLogLevel(level: string): void {
  logLevel = level;
  agentLogger.level = level;
  gatewayLogger.level = level;
}

// Pre-configured service loggers
export const agentLogger = createLogger('agent', logLevel);
export const gatewayLogger = createLogger('gateway', logLevel);

