// lib/approval.ts — path sandbox access control

import { resolve, normalize, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import type { AnyaConfig } from '../config/defaults.js';

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return p.replace('~', homedir());
  }
  return p;
}

// Uses relative() to prevent prefix collision (e.g., /a/.anya-malicious vs /a/.anya).
function isInsideDir(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('..' + sep));
}

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
