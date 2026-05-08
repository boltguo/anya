/**
 * @module agent/errorClassifier
 * @description Structured API-error classification for provider calls.
 *
 * Converts raw provider errors into a {@link ClassifiedError} with explicit
 * recovery hints. The hints are consumed by two layers:
 *
 * **Provider layer** ({@link CodexProvider.chat}): owns retry loops.
 *   Uses: `retryable`, `backoffMs`, `shouldRotate` (for multi-key rotation).
 *   Guarantees: either returns `LLMResponse` or throws an unrecoverable error.
 *
 * **Agent layer** ({@link Agent.run}): handles context-level recovery.
 *   Uses: `shouldCompress` (triggers context compression on overflow).
 *   Does NOT retry — the Provider has already exhausted retries.
 *
 * Status code extraction priority:
 *   1. SDK error object `.status` property (Gemini `ApiError`, fetch response status)
 *   2. Common `.statusCode` / `.httpStatus` properties
 *   3. Regex fallback from error message text
 */

// ── Failover Reason ─────────────────────────────────────────────────────────

export type FailoverReason =
  | 'auth'              // 401/403 — token refresh, then rotate
  | 'auth_permanent'    // refresh itself failed — abort
  | 'billing'           // 402 (real) — credit exhausted, rotate key
  | 'rate_limit'        // 429 or soft-quota — back off, then rotate
  | 'overloaded'        // 503/529 — provider overloaded, back off
  | 'server_error'      // 500/502 — transient, retry
  | 'timeout'           // network timeout / ECONNRESET
  | 'context_overflow'  // prompt too large — compress, don't rotate
  | 'model_not_found'   // 404 — wrong model id, abort
  | 'format_error'      // 400 — bad request shape, abort
  | 'unknown';          // catch-all — retry with back-off

// ── Classified Error ────────────────────────────────────────────────────────

export interface ClassifiedError {
  reason: FailoverReason;
  retryable: boolean;
  shouldCompress: boolean;
  shouldRotate: boolean;
  shouldFallback: boolean;
  backoffMs: number;
  original: Error;
}

// ── Pattern lists (checked in order) ────────────────────────────────────────

const CONTEXT_OVERFLOW_PATTERNS = [
  'context length',
  'token limit',
  'maximum context',
  'too many tokens',
  'exceeds the model',
  'prompt is too long',
  'request too large',
  'content_too_large',
  'max_tokens',
  'input is too long',
];

const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'too many requests',
  'quota exceeded',
  'resource exhausted',
  'resource_exhausted',
  'try again in',
  'resets at',
  'retry after',
  'throttl',
];

const BILLING_PATTERNS = [
  'insufficient credits',
  'exceeded quota',
  'billing',
  'payment required',
  'account has been deactivated',
  'usage limit exceeded',
];

const TIMEOUT_PATTERNS = [
  'timeout',
  'timed out',
  'econnreset',
  'econnrefused',
  'enotfound',
  'socket hang up',
  'network error',
  'fetch failed',
  'aborted',
];

// ── Classifier ──────────────────────────────────────────────────────────────

/**
 * Classify a raw provider error into a structured recovery hint.
 *
 * Classification priority:
 *   1. HTTP status code (if extractable)
 *   2. Context-overflow patterns
 *   3. Rate-limit / billing patterns
 *   4. Timeout / network patterns
 *   5. Fallback: unknown (still retryable)
 */
export function classifyApiError(error: unknown): ClassifiedError {
  const err = error instanceof Error ? error : new Error(String(error));
  const msg = err.message.toLowerCase();

  const status = extractStatus(err);

  // ── 1. Status-based classification ────────────────────────────────
  if (status === 401 || status === 403) {
    return make('auth', err, { retryable: true, shouldRotate: true, backoffMs: 0 });
  }

  if (status === 402) {
    // Disambiguate billing vs temporary quota
    const isTempQuota = RATE_LIMIT_PATTERNS.some(p => msg.includes(p));
    if (isTempQuota) {
      return make('rate_limit', err, { retryable: true, shouldRotate: true, backoffMs: 5_000 });
    }
    return make('billing', err, { retryable: false, shouldRotate: true, shouldFallback: true });
  }

  if (status === 404) {
    return make('model_not_found', err, { retryable: false });
  }

  if (status === 429) {
    return make('rate_limit', err, { retryable: true, shouldRotate: true, backoffMs: 5_000 });
  }

  if (status === 400) {
    // 400 could be context overflow disguised as a bad request
    if (CONTEXT_OVERFLOW_PATTERNS.some(p => msg.includes(p))) {
      return make('context_overflow', err, { retryable: true, shouldCompress: true, backoffMs: 0 });
    }
    return make('format_error', err, { retryable: false });
  }

  if (status === 500 || status === 502) {
    return make('server_error', err, { retryable: true, backoffMs: 2_000 });
  }

  if (status === 503 || status === 529) {
    return make('overloaded', err, { retryable: true, backoffMs: 5_000 });
  }

  // ── 2. Pattern-based classification (no clear status) ─────────────
  if (CONTEXT_OVERFLOW_PATTERNS.some(p => msg.includes(p))) {
    return make('context_overflow', err, { retryable: true, shouldCompress: true, backoffMs: 0 });
  }

  if (RATE_LIMIT_PATTERNS.some(p => msg.includes(p))) {
    return make('rate_limit', err, { retryable: true, shouldRotate: true, backoffMs: 5_000 });
  }

  if (BILLING_PATTERNS.some(p => msg.includes(p))) {
    return make('billing', err, { retryable: false, shouldRotate: true, shouldFallback: true });
  }

  if (TIMEOUT_PATTERNS.some(p => msg.includes(p))) {
    return make('timeout', err, { retryable: true, backoffMs: 2_000 });
  }

  // ── 3. Fallback ───────────────────────────────────────────────────
  return make('unknown', err, { retryable: true, backoffMs: 3_000 });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractStatus(err: Error): number | null {
  // 1. SDK error objects (Gemini ApiError, etc.) have a .status property
  const anyErr = err as unknown as Record<string, unknown>;
  if (typeof anyErr.status === 'number') return anyErr.status;
  if (typeof anyErr.statusCode === 'number') return anyErr.statusCode;
  if (typeof anyErr.httpStatus === 'number') return anyErr.httpStatus;

  // 2. Regex fallback: match "(429)", "status 429", "error 429", "HTTP 429"
  const msg = err.message.toLowerCase();
  const m = msg.match(/(?:status|error|http)?\s*\(?(\d{3})\)?/);
  return m ? parseInt(m[1], 10) : null;
}

interface MakeOpts {
  retryable?: boolean;
  shouldCompress?: boolean;
  shouldRotate?: boolean;
  shouldFallback?: boolean;
  backoffMs?: number;
}

function make(reason: FailoverReason, original: Error, opts: MakeOpts = {}): ClassifiedError {
  return {
    reason,
    retryable: opts.retryable ?? false,
    shouldCompress: opts.shouldCompress ?? false,
    shouldRotate: opts.shouldRotate ?? false,
    shouldFallback: opts.shouldFallback ?? false,
    backoffMs: opts.backoffMs ?? 0,
    original,
  };
}
