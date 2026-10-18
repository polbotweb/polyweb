/**
 * Abstract store interfaces for cache and rate-limiting.
 *
 * Current implementation: in-memory (MemoryStore).
 * Migration path: implement RedisStore with the same interfaces
 * and swap via STORE_BACKEND=redis environment variable.
 *
 * ⚠️  PRODUCTION NOTE: For multi-instance deployments (cluster, k8s replicas),
 * switch to Redis/Valkey. Otherwise each node tracks state independently.
 */

// ─── Rate-Limit Store ──────────────────────────────────────────────────────────

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
  delete(key: string): void;
  size: number;
  entries(): IterableIterator<[string, RateLimitEntry]>;
  clear(): void;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();

  get(key: string) { return this.store.get(key); }
  set(key: string, entry: RateLimitEntry) { this.store.set(key, entry); }
  delete(key: string) { this.store.delete(key); }
  get size() { return this.store.size; }
  entries() { return this.store.entries(); }
  clear() { this.store.clear(); }
}

// ─── Cache Store ────────────────────────────────────────────────────────────────

export interface CacheEntry {
  data: unknown;
  expiresAt: number;
  /** Timestamp when the entry was first cached (for absolute max-age). */
  createdAt: number;
}

export interface CacheStore {
  get(key: string): CacheEntry | undefined;
  set(key: string, entry: CacheEntry): void;
  delete(key: string): void;
  keys(): IterableIterator<string>;
  get size(): number;
  clear(): void;
  /** Move key to end (for LRU). Implementations that don't support ordering can no-op. */
  touch(key: string, entry: CacheEntry): void;
  /** Get the first (oldest) key, for FIFO eviction. */
  firstKey(): string | undefined;
}

export class MemoryCacheStore implements CacheStore {
  private store = new Map<string, CacheEntry>();

  get(key: string) { return this.store.get(key); }
  set(key: string, entry: CacheEntry) { this.store.set(key, entry); }
  delete(key: string) { this.store.delete(key); }
  keys() { return this.store.keys(); }
  get size() { return this.store.size; }
  clear() { this.store.clear(); }
  touch(key: string, entry: CacheEntry) {
    this.store.delete(key);
    this.store.set(key, entry);
  }
  firstKey() { return this.store.keys().next().value; }
}

// ─── Store Provider ─────────────────────────────────────────────────────────────

let rateLimitStore: RateLimitStore | null = null;
let cacheStore: CacheStore | null = null;

/** Get the rate-limit store (singleton). */
export function getRateLimitStore(): RateLimitStore {
  if (!rateLimitStore) {
    // Future: check process.env.STORE_BACKEND === 'redis' → new RedisRateLimitStore()
    rateLimitStore = new MemoryRateLimitStore();
  }
  return rateLimitStore;
}

/** Get the cache store (singleton). */
export function getCacheStore(): CacheStore {
  if (!cacheStore) {
    // Future: check process.env.STORE_BACKEND === 'redis' → new RedisCacheStore()
    cacheStore = new MemoryCacheStore();
  }
  return cacheStore;
}

/** Override stores (for testing or custom backends). */
export function setStores(opts: { rateLimit?: RateLimitStore; cache?: CacheStore }) {
  if (opts.rateLimit) rateLimitStore = opts.rateLimit;
  if (opts.cache) cacheStore = opts.cache;
}
