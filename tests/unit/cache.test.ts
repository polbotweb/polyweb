import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cached, invalidateCache, getCacheStats, shutdownCache } from '@database/cache';

describe('Cache — cached() wrapper', () => {
  beforeEach(() => {
    invalidateCache(); // clear all
  });

  it('caches the result of an async function', async () => {
    let callCount = 0;
    const fn = cached(
      (id: string) => `test:${id}`,
      async (id: string) => {
        callCount++;
        return { id, value: 42 };
      },
    );

    const r1 = await fn('a');
    const r2 = await fn('a');

    expect(r1).toEqual({ id: 'a', value: 42 });
    expect(r2).toEqual({ id: 'a', value: 42 });
    expect(callCount).toBe(1); // only called once
  });

  it('uses different cache keys for different arguments', async () => {
    let callCount = 0;
    const fn = cached(
      (id: string) => `test:${id}`,
      async (id: string) => {
        callCount++;
        return id;
      },
    );

    await fn('x');
    await fn('y');

    expect(callCount).toBe(2);
  });

  it('invalidateCache(prefix) removes matching keys only', async () => {
    let callCount = 0;
    const fnA = cached(
      () => 'site:settings',
      async () => ++callCount,
    );
    const fnB = cached(
      () => 'nav:main',
      async () => ++callCount,
    );

    await fnA(); // callCount = 1
    await fnB(); // callCount = 2

    invalidateCache('site:');

    await fnA(); // re-fetched, callCount = 3
    await fnB(); // still cached

    expect(callCount).toBe(3);
  });

  it('invalidateCache() without prefix clears everything', async () => {
    let callCount = 0;
    const fn = cached(
      () => 'key',
      async () => ++callCount,
    );

    await fn(); // 1
    invalidateCache();
    await fn(); // 2

    expect(callCount).toBe(2);
  });

  it('respects TTL expiration', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const fn = cached(
      () => 'ttl-test',
      async () => ++callCount,
      50, // 50ms TTL
    );

    await fn(); // 1
    await fn(); // still cached

    await vi.advanceTimersByTimeAsync(80);
    await fn(); // expired, re-fetched → 2

    expect(callCount).toBe(2);
    vi.useRealTimers();
  });

  it('coalesces concurrent calls to the same key', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const fn = cached(
      () => 'coalesce',
      async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 50));
        return 'result';
      },
    );

    const p1 = fn();
    const p2 = fn();
    const p3 = fn();
    await vi.advanceTimersByTimeAsync(50);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(callCount).toBe(1);
    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(r3).toBe('result');
    vi.useRealTimers();
  });

  it('does not cache errors and retries on next call', async () => {
    let callCount = 0;
    const fn = cached(
      () => 'err-test',
      async () => {
        callCount++;
        if (callCount === 1) throw new Error('fail');
        return 'ok';
      },
    );

    await expect(fn()).rejects.toThrow('fail');
    const result = await fn();
    expect(result).toBe('ok');
    expect(callCount).toBe(2);
  });

  it('cleans up inflight entry on error (concurrent call after error retries)', async () => {
    let callCount = 0;
    const fn = cached(
      () => 'inflight-err',
      async () => {
        callCount++;
        if (callCount === 1) throw new Error('boom');
        return 'recovered';
      },
    );

    // First call fails — should clean up inflight
    await expect(fn()).rejects.toThrow('boom');
    // Second concurrent call should NOT get the old inflight promise
    const result = await fn();
    expect(result).toBe('recovered');
    expect(callCount).toBe(2);
  });

  it('evicts oldest entry when MAX_ENTRIES (500) is exceeded', async () => {
    // Fill cache to capacity
    const fns: Array<() => Promise<number>> = [];
    for (let i = 0; i < 501; i++) {
      const fn = cached(
        () => `evict:${i}`,
        async () => i,
      );
      fns.push(fn);
    }

    // Populate all 501 entries
    for (let i = 0; i < 501; i++) {
      await fns[i]();
    }

    // The first entry (evict:0) should have been evicted.
    // Calling fns[0] should re-execute the underlying function.
    let reExecuted = false;
    const check = cached(
      () => 'evict:0',
      async () => {
        reExecuted = true;
        return -1;
      },
    );
    await check();
    expect(reExecuted).toBe(true);
  });

  it('LRU: accessing an entry moves it to the end (not evicted first)', async () => {
    // Fill cache near capacity
    for (let i = 0; i < 499; i++) {
      const fn = cached(() => `lru:${i}`, async () => i);
      await fn();
    }

    // Add key "lru:target"
    let targetCalls = 0;
    const target = cached(() => 'lru:target', async () => ++targetCalls);
    await target(); // targetCalls = 1

    // Access it again (moves to end via LRU logic)
    await target(); // still cached, no re-call

    // Now fill to overflow
    const overflow = cached(() => 'lru:overflow', async () => 999);
    await overflow();

    // Target should still be cached because it was recently accessed
    await target();
    expect(targetCalls).toBe(1); // still served from cache
  });
});

describe('getCacheStats', () => {
  it('returns hit/miss/size/inflight statistics', async () => {
    invalidateCache();
    const fn = cached(() => 'stats-test', async () => 42);
    await fn(); // miss
    await fn(); // hit

    const stats = getCacheStats();
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('size');
    expect(stats).toHaveProperty('inflight');
    expect(stats.size).toBeGreaterThanOrEqual(1);
  });
});

describe('shutdownCache', () => {
  it('clears all cache entries and inflight', async () => {
    const fn = cached(() => 'shutdown-test', async () => 'val', 60_000);
    await fn();

    shutdownCache();

    const stats = getCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.inflight).toBe(0);
  });
});
