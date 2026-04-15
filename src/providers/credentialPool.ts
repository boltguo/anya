/**
 * @module providers/credentialPool
 * @description Multi-key credential pool with automatic rotation.
 *
 * When a provider has multiple API keys configured, the pool hands out the
 * current "active" key and rotates to the next healthy one when the caller
 * reports a failure (rate-limit, billing, auth error).
 *
 * Each key tracks its own status and cooldown. Exhausted keys are skipped
 * until their cooldown expires.
 *
 * Single-key setups work transparently — the pool just returns the one key.
 */

import type { FailoverReason } from '../agent/errorClassifier.js';
import { agentLogger } from '../lib/logger.js';

export type CredentialStatus = 'ok' | 'exhausted' | 'rate_limited' | 'error';

export interface CredentialEntry {
  id: string;
  provider: 'gemini' | 'openai';
  apiKey: string;
  status: CredentialStatus;
  cooldownUntil: number;
}

const DEFAULT_COOLDOWN_MS: Record<CredentialStatus, number> = {
  ok: 0,
  rate_limited: 60_000,
  exhausted: 300_000,
  error: 120_000,
};

export class CredentialPool {
  private credentials: CredentialEntry[] = [];
  private currentIndex = 0;

  /**
   * Register a new API key in the pool.
   * Idempotent — duplicate keys (same provider + apiKey) are silently ignored.
   *
   * @param provider - The provider this key belongs to.
   * @param apiKey - The raw API key string.
   * @param id - Optional human-readable identifier for logging.
   */
  register(provider: 'gemini' | 'openai', apiKey: string, id?: string): void {
    if (this.credentials.some(c => c.provider === provider && c.apiKey === apiKey)) return;
    this.credentials.push({
      id: id || `${provider}-${this.credentials.length}`,
      provider,
      apiKey,
      status: 'ok',
      cooldownUntil: 0,
    });
  }

  /**
   * Get the current active credential for a provider.
   * Skips credentials that are in cooldown. Returns null if none available.
   */
  current(provider: 'gemini' | 'openai'): CredentialEntry | null {
    const pool = this.credentials.filter(c => c.provider === provider);
    if (pool.length === 0) return null;

    const now = Date.now();
    // Try from currentIndex forward, wrapping around
    for (let i = 0; i < pool.length; i++) {
      const idx = (this.currentIndex + i) % pool.length;
      const cred = pool[idx];
      if (cred.cooldownUntil <= now) {
        if (cred.status !== 'ok') {
          cred.status = 'ok';
        }
        this.currentIndex = idx;
        return cred;
      }
    }

    // All in cooldown — return the one with the shortest remaining cooldown
    const soonest = pool.reduce((a, b) => a.cooldownUntil < b.cooldownUntil ? a : b);
    agentLogger.warn({
      msg: 'credential_pool_all_cooling',
      provider,
      resumesIn: Math.ceil((soonest.cooldownUntil - now) / 1000),
    });
    return soonest;
  }

  /**
   * Mark the current credential as failed and rotate to the next one.
   * Returns the next available credential, or null if none.
   */
  rotate(provider: 'gemini' | 'openai', reason: FailoverReason): CredentialEntry | null {
    const pool = this.credentials.filter(c => c.provider === provider);
    if (pool.length <= 1) return this.current(provider);

    const failing = pool[this.currentIndex % pool.length];
    const status = reasonToStatus(reason);
    failing.status = status;
    failing.cooldownUntil = Date.now() + DEFAULT_COOLDOWN_MS[status] + Math.random() * 5_000;

    agentLogger.info({
      msg: 'credential_rotated',
      provider, id: failing.id,
      reason, status,
      cooldownMs: failing.cooldownUntil - Date.now(),
    });

    this.currentIndex = (this.currentIndex + 1) % pool.length;
    return this.current(provider);
  }

  /** How many credentials are registered for a provider. */
  size(provider: 'gemini' | 'openai'): number {
    return this.credentials.filter(c => c.provider === provider).length;
  }

  /** Reset all credentials to ok (e.g. after config reload). */
  reset(): void {
    for (const c of this.credentials) {
      c.status = 'ok';
      c.cooldownUntil = 0;
    }
    this.currentIndex = 0;
  }
}

/** Map an error classification reason to a credential status for cooldown. */
function reasonToStatus(reason: FailoverReason): CredentialStatus {
  switch (reason) {
    case 'billing': return 'exhausted';
    case 'rate_limit': return 'rate_limited';
    case 'auth':
    case 'auth_permanent': return 'error';
    default: return 'error';
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

let _pool: CredentialPool | null = null;

/** Get the global singleton credential pool instance. */
export function getCredentialPool(): CredentialPool {
  if (!_pool) _pool = new CredentialPool();
  return _pool;
}
