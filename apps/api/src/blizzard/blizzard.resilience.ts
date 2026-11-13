import type { ResiliencePreset } from '@nestjs/resilience';
import { BlizzardApiError, BlizzardAuthError } from './blizzard.errors';

/** DI token for the policy options, so tests can swap in a fast backoff. */
export const BLIZZARD_RESILIENCE_OPTIONS = Symbol('BLIZZARD_RESILIENCE_OPTIONS');

/**
 * Retry only failures that may succeed on a second try:
 * - HTTP 5xx, 408 (timeout) and 429 (rate limited) from Blizzard
 * - network failures and our own request timeouts
 * Everything else (other 4xx, missing credentials, bad response shape) fails immediately.
 */
export function isTransientBlizzardError(error: unknown): boolean {
  if (error instanceof BlizzardApiError || error instanceof BlizzardAuthError) {
    const { status } = error;
    return status !== undefined && (status >= 500 || status === 408 || status === 429);
  }
  // Compare by name, not instanceof: errors thrown by Node's fetch come from a
  // different JS realm than test code under Jest, so instanceof would be false.
  const { name, message } = (error ?? {}) as { name?: unknown; message?: unknown };
  const networkFailure = name === 'TypeError' && message === 'fetch failed';
  const timedOut = name === 'TimeoutError'; // AbortSignal.timeout()
  return networkFailure || timedOut;
}

/**
 * 3 attempts in total, waiting ~1s then ~2s (exponential, capped at 10s).
 * Full jitter randomises each wait so many clients don't retry in lockstep.
 * An hourly job can afford to wait; giving up too early would lose a snapshot.
 */
export const blizzardResilienceOptions: ResiliencePreset = {
  retry: {
    attempts: 3,
    backoff: { delay: '1s', factor: 2, maxDelay: '10s', jitter: 'full' },
    retryIf: isTransientBlizzardError,
  },
};
