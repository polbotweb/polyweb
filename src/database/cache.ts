/**
 * TTL cache for DB loaders with pluggable store backend.
 *
 * Default: in-memory store (single-node).
 * Redis: swap the store via `setStores()` for multi-instance deployments.
 * See src/lib/store.ts for the store abstraction.
 */

import { getCacheStore } from '@/lib/store';

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_AGE_MS = 30 * 60 * 1000;   // 30 minutes absolute max (prevents infinite sliding)
const MAX_ENTRIES = 500;

const inflight = new Map<string, Promise<unknown>>();

// ─── Cache statistics (debug / monitoring) ────────────────────────────────────
let hits = 0;
let misses = 0;

/** Return cache hit/miss statistics. */
export function getCacheStats() {
  const store = getCacheStore();
  return { hits, misses, size: store.size, inflight: inflight.size };
}

// Cleanup expired entries every 2 minutes
let cleanupInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
  const now = Date.now();
  const store = getCacheStore();
  for (const key of store.keys()) {
    const entry = store.get(key);
    if (entry && now >= entry.expiresAt) store.delete(key);
  }
}, 2 * 60 * 1000);
cleanupInterval.unref();

/** Stop the cache cleanup interval. Call during graceful shutdown. */
export function shutdownCache(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  getCacheStore().clear();
  inflight.clear();
}

/**
 * Wrap an async function with a TTL cache.
 *
 * - Coalesces concurrent calls to the same key (single DB query).
 * - Evicts oldest entries when MAX_ENTRIES is exceeded (FIFO).
 *
 * @param keyFn  Builds the cache key from the original arguments
 * @param fn     The original async function to cache
 * @param ttlMs  Time-to-live in milliseconds (default 5 min)
 */
export function cached<Args extends unknown[], R>(
  keyFn: (...args: Args) => string,
  fn: (...args: Args) => Promise<R>,
  ttlMs = DEFAULT_TTL_MS,
): (...args: Args) => Promise<R> {
  return (...args: Args): Promise<R> => {
    const key = keyFn(...args);
    const store = getCacheStore();
    const entry = store.get(key);

    if (entry && Date.now() < entry.expiresAt) {
      // Enforce absolute max-age — stale entries cannot live forever via sliding TTL
      if (entry.createdAt && Date.now() - entry.createdAt >= MAX_AGE_MS) {
        store.delete(key);
      } else {
        hits++;
        entry.expiresAt = Date.now() + ttlMs; // Sliding TTL — refresh on hit
        store.touch(key, entry); // Move to end → LRU
        return Promise.resolve(entry.data as R);
      }
    }

    // Return existing in-flight promise if one exists (coalescing)
    const pending = inflight.get(key);
    if (pending) return pending as Promise<R>;

    misses++;
    const promise = fn(...args).then((data) => {
      const s = getCacheStore();
      // Evict oldest entries if over limit
      if (s.size >= MAX_ENTRIES) {
        const firstKey = s.firstKey();
        if (firstKey !== undefined) s.delete(firstKey);
      }
      s.set(key, { data, expiresAt: Date.now() + ttlMs, createdAt: Date.now() });
      inflight.delete(key);
      return data;
    }).catch((err) => {
      inflight.delete(key);
      throw err;
    });

    inflight.set(key, promise);
    return promise;
  };
}

/**
 * Invalidate cache entries.
 *
 * - No argument → clears everything
 * - With `prefix` → removes keys starting with that prefix
 */
export function invalidateCache(prefix?: string): void {
  const store = getCacheStore();
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
