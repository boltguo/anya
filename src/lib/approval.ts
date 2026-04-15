/**
 * @module lib/approval
 * @description Security helpers for path sandboxing and command approval.
 *
 * Two main guards:
 * - {@link isPathAllowed} — checks if a file path falls within configured
 *   allowed directories (config.security.allowed_paths). Prevents file
 *   tools from reading/writing outside the sandbox.
 * - {@link isCommandAllowed} — checks if a shell command matches the
 *   approval allowlist (config.tools.shell.approval_allowlist). Prevents
 *   running unapproved commands without user consent.
 */

import { resolve, normalize, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import type { AnyaConfig } from '../config/defaults.js';

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
 * Check whether `child` is equal to or inside `parent` directory.
 * Uses relative() to avoid the classic startsWith prefix-collision bug
 * (e.g. /a/.anya-malicious matching /a/.anya).
 */
function isInsideDir(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('..' + sep));
}

/**
 * Check if a file path is within the allowed directories.
 * Returns true if the path is inside any of config.security.allowed_paths.
 */
export function isPathAllowed(filePath: string, config: AnyaConfig): boolean {
  const resolved = normalize(resolve(expandHome(filePath)));

  for (const allowed of config.security.allowed_paths) {
    const allowedResolved = normalize(resolve(expandHome(allowed)));
    if (isInsideDir(resolved, allowedResolved)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a shell command matches the approval allowlist.
 * Matches if the command starts with any allowed prefix.
 */
export function isCommandAllowed(command: string, config: AnyaConfig): boolean {
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
