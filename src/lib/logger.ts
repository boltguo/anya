// lib/logger.ts — pino-based structured logging

import pino from 'pino';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOGS_DIR } from './paths.js';

if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

function createLogger(service: string, level: string = 'info'): pino.Logger {
  try {
    const dest = pino.destination({
      dest: join(LOGS_DIR, `${service}.log`),
      append: true,
      // Sync writes are acceptable for low-volume logging
      sync: true,
    });
    return pino({ level, name: service }, dest);
  } catch {
    // Fallback to stderr if file transport fails
    return pino({ level, name: service });
  }
}

let logLevel = 'info';

export function setLogLevel(level: string): void {
  logLevel = level;
  agentLogger.level = level;
  gatewayLogger.level = level;
}

export const agentLogger = createLogger('agent', logLevel);
export const gatewayLogger = createLogger('gateway', logLevel);
