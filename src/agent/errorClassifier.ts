// agent/errorClassifier.ts — provider error classification

export type FailoverReason =
  | 'auth'              // 401/403 — Token requires refresh or rotation.
  | 'auth_permanent'    // Irrecoverable authentication failure.
  | 'billing'           // 402 — Account credit depleted.
  | 'rate_limit'        // 429 — Throttle encountered, retry after backoff.
  | 'overloaded'        // 503/529 — Remote service degradation.
  | 'server_error'      // 500/502 — Unhandled remote exception.
  | 'timeout'           // Network transit breakdown.
  | 'context_overflow'  // Model sequence limit breached; prompt reduction required.
  | 'model_not_found'   // 404 — Invalid target model configured.
  | 'format_error'      // 400 — Structural violation in the outbound payload.
  | 'unknown';          // Uncategorized failure; standard retry mechanics apply.

export interface ClassifiedError {
  reason: FailoverReason;
  retryable: boolean;
  shouldCompress: boolean;
  shouldRotate: boolean;
  shouldFallback: boolean;
  backoffMs: number;
  original: Error;
}

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

export function classifyApiError(error: unknown): ClassifiedError {
  const err = error instanceof Error ? error : new Error(String(error));
  const msg = err.message.toLowerCase();

  const status = extractStatus(err);

  if (status === 401 || status === 403) {
    return make('auth', err, { retryable: true, shouldRotate: true, backoffMs: 0 });
  }

  if (status === 402) {
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

  return make('unknown', err, { retryable: true, backoffMs: 3_000 });
}

function extractStatus(err: Error): number | null {
  const anyErr = err as unknown as Record<string, unknown>;
  if (typeof anyErr.status === 'number') return anyErr.status;
  if (typeof anyErr.statusCode === 'number') return anyErr.statusCode;
  if (typeof anyErr.httpStatus === 'number') return anyErr.httpStatus;

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
