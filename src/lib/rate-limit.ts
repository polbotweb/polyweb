/**
 * Fixed-window rate limiter with pluggable store backend.
 *
 * Default: in-memory store (single-node).
 * Redis: swap the store via `setStores()` for multi-instance deployments.
 * See src/lib/store.ts for the store abstraction.
 */

import { getRateLimitStore } from './store';

const MAX_ENTRIES = 10_000;

// Cleanup stale entries every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  const store = getRateLimitStore();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);
cleanupInterval.unref();

export interface RateLimitOptions {
  /** Time window in seconds */
  window: number;
  /** Max requests allowed in the window */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request from the given key (typically IP) is within rate limits.
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const windowMs = opts.window * 1000;
  const store = getRateLimitStore();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    if (store.size >= MAX_ENTRIES) {
      // Purge expired entries first
      for (const [k, v] of store.entries()) { if (now >= v.resetAt) store.delete(k); }
      // If still at capacity after purge, reject (fail-closed) to prevent store-flooding attacks
      if (store.size >= MAX_ENTRIES) {
        return { allowed: false, remaining: 0, resetAt: now + windowMs };
      }
    }
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: opts.max - 1, resetAt: now + windowMs };
  }

  if (entry.count < opts.max) {
    entry.count++;
    return { allowed: true, remaining: opts.max - entry.count, resetAt: entry.resetAt };
  }

  // Add jitter (±2s) to prevent attackers from timing requests to the exact reset
  const jitter = Math.floor(Math.random() * 4000) - 2000;
  const jitteredReset = Math.max(Date.now() + 1000, entry.resetAt + jitter);
  return { allowed: false, remaining: 0, resetAt: jitteredReset };
}

/** Clear all rate limit entries — exposed for testing only. */
export function resetRateLimiter(): void {
  getRateLimitStore().clear();
}
