// lib/logger.ts — pino-based structured logging

import pino from 'pino';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LOGS_DIR } from './paths.js';

if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

function createLogger(service: string): pino.Logger {
  try {
    const dest = pino.destination({
      dest: join(LOGS_DIR, `${service}.log`),
      append: true,
      sync: true,
    });
    return pino({ level: 'info', name: service }, dest);
  } catch {
    return pino({ level: 'info', name: service });
  }
}

export const agentLogger = createLogger('agent');
export const gatewayLogger = createLogger('gateway');
