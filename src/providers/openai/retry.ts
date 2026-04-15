/**
 * @module providers/openai/retry
 * @description Retry classification — delegates to the central errorClassifier.
 * Kept for backwards compatibility; new code should import classifyApiError directly.
 */

import { classifyApiError } from '../../agent/errorClassifier.js';

export function isRetryable(status: number): boolean {
  const classified = classifyApiError(new Error(`HTTP ${status}`));
  return classified.retryable;
}
