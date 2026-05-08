/**
 * @module lib/approval
 * @description Security utilities enforcing path sandboxing and access control.
 *
 * Provides safety mechanisms including:
 * - {@link isPathAllowed} — validates if a target file path resides within
 *   the configured allowed directory sandbox (`config.security.allowed_paths`).
 *   This prevents unauthorized read/write operations outside designated bounds.
 */

import { resolve, normalize, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import type { AnyaConfig } from '../config/defaults.js';

/**
 * Expands a tilde (`~`) prefix in a given file path to the user's home directory.
 *
 * @param {string} p - The file path potentially starting with `~`.
 * @returns {string} The path with the home directory expanded.
 */
function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return p.replace('~', homedir());
  }
  return p;
}

/**
 * Determines whether a child path resolves within a parent directory.
 * Utilizes `relative()` to reliably prevent prefix collision vulnerabilities
 * (e.g., verifying `/a/.anya-malicious` does not match `/a/.anya`).
 *
 * @param {string} child - The target path being validated.
 * @param {string} parent - The permitted parent directory.
 * @returns {boolean} True if the child is within or exactly matches the parent.
 */
function isInsideDir(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('..' + sep));
}

/**
 * Validates if a file path is permitted according to security configuration.
 * Resolves paths and verifies containment against `config.security.allowed_paths`.
 *
 * @param {string} filePath - The absolute or relative path to validate.
 * @param {AnyaConfig} config - The active application configuration instance.
 * @returns {boolean} True if the path is explicitly allowed by the configuration sandbox.
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
