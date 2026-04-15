/**
 * @module lib/logger
 * @description Structured JSON logging via pino with daily log rotation.
 *
 * Creates separate logger instances for each service (agent, gateway, cron),
 * each writing to `~/.anya/logs/<service>.log`. Uses `pino-roll` for
 * automatic daily rotation with a 5-file limit.
 *
 * Falls back to stderr-only logging if the file transport fails.
 */

import pino from 'pino';
import { existsSync, mkdirSync } from 'node:fs';
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
    const transport = pino.transport({
      targets: [
        {
          target: 'pino-roll',
          options: {
            file: `${LOGS_DIR}/${service}.log`,
            frequency: 'daily',
            size: '10m',
            limit: { count: 5 },
          },
          level,
        },
      ],
    });

    return pino({ level, name: service }, transport);
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

/**
 * Get a child logger with additional context.
 */
export function getLogger(service: 'agent' | 'gateway' | 'cron'): pino.Logger {
  switch (service) {
    case 'agent': return agentLogger;
    case 'gateway': return gatewayLogger;
    case 'cron': return cronLogger;
  }
}
