import { resolve, normalize } from 'node:path';
import { homedir } from 'node:os';
import type { VelaConfig } from '../config/defaults.js';

/**
 * Expand ~ to home directory in a path.
 */
function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return p.replace('~', homedir());
  }
  return p;
}

/**
 * Check if a file path is within the allowed directories.
 * Returns true if the path is inside any of config.security.allowed_paths.
 */
export function isPathAllowed(filePath: string, config: VelaConfig): boolean {
  const resolved = normalize(resolve(expandHome(filePath)));

  for (const allowed of config.security.allowed_paths) {
    const allowedResolved = normalize(resolve(expandHome(allowed)));
    if (resolved.startsWith(allowedResolved)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a shell command matches the approval allowlist.
 * Matches if the command starts with any allowed prefix.
 */
export function isCommandAllowed(command: string, config: VelaConfig): boolean {
  if (!config.tools.shell.require_approval) {
    return true;
  }

  const trimmed = command.trim();

  for (const allowed of config.tools.shell.approval_allowlist) {
    if (trimmed === allowed || trimmed.startsWith(allowed + ' ')) {
      return true;
    }
  }

  return false;
}

/**
 * Result of an approval request.
 */
export type ApprovalResult = 'allow' | 'deny' | 'always';
