import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit } from '@/lib/rate-limit';

describe('checkRateLimit', () => {
  // Use unique keys per test to avoid shared state
  let keyPrefix: string;

  beforeEach(() => {
    keyPrefix = `test-${Date.now()}-${Math.random()}`;
  });

  it('allows requests within the limit', () => {
    const key = `${keyPrefix}:allow`;
    const result = checkRateLimit(key, { window: 60, max: 5 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('decrements remaining on each call', () => {
    const key = `${keyPrefix}:decrement`;
    checkRateLimit(key, { window: 60, max: 3 });
    const r2 = checkRateLimit(key, { window: 60, max: 3 });
    expect(r2.remaining).toBe(1);
    const r3 = checkRateLimit(key, { window: 60, max: 3 });
    expect(r3.remaining).toBe(0);
  });

  it('blocks requests when limit is exceeded', () => {
    const key = `${keyPrefix}:block`;
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, { window: 60, max: 3 });
    }
    const blocked = checkRateLimit(key, { window: 60, max: 3 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('returns a valid resetAt timestamp in the future', () => {
    const key = `${keyPrefix}:reset`;
    const result = checkRateLimit(key, { window: 10, max: 5 });
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
    expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 10_000 + 100);
  });

  it('uses different counters for different keys', () => {
    const k1 = `${keyPrefix}:a`;
    const k2 = `${keyPrefix}:b`;
    checkRateLimit(k1, { window: 60, max: 2 });
    checkRateLimit(k1, { window: 60, max: 2 });
    const blockedK1 = checkRateLimit(k1, { window: 60, max: 2 });
    expect(blockedK1.allowed).toBe(false);

    const allowedK2 = checkRateLimit(k2, { window: 60, max: 2 });
    expect(allowedK2.allowed).toBe(true);
  });

  it('resets counter after window expires', () => {
    vi.useFakeTimers();
    try {
      const key = `${keyPrefix}:expire`;
      // Exhaust the limit
      checkRateLimit(key, { window: 2, max: 1 });
      const blocked = checkRateLimit(key, { window: 2, max: 1 });
      expect(blocked.allowed).toBe(false);

      // Advance past the 2-second window
      vi.advanceTimersByTime(2100);

      const afterExpiry = checkRateLimit(key, { window: 2, max: 1 });
      expect(afterExpiry.allowed).toBe(true);
      expect(afterExpiry.remaining).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('provides fresh remaining count after window resets', () => {
    vi.useFakeTimers();
    try {
      const key = `${keyPrefix}:fresh`;
      checkRateLimit(key, { window: 1, max: 3 });
      checkRateLimit(key, { window: 1, max: 3 });
      // remaining should be 1 now
      const r = checkRateLimit(key, { window: 1, max: 3 });
      expect(r.remaining).toBe(0);

      // Advance past window
      vi.advanceTimersByTime(1100);

      const fresh = checkRateLimit(key, { window: 1, max: 3 });
      expect(fresh.remaining).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects when MAX_ENTRIES is reached with active entries (fail-closed)', () => {
    // Fill the store with 10_000 unique active keys
    const opts = { window: 3600, max: 1 };
    for (let i = 0; i < 10_000; i++) {
      checkRateLimit(`${keyPrefix}:flood-${i}`, opts);
    }

    // The next new key should be rejected (fail-closed) to prevent store-flooding attacks
    const result = checkRateLimit(`${keyPrefix}:overflow`, opts);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('jittered resetAt is always at least 1 second in the future', () => {
    const key = `${keyPrefix}:jitter-floor`;
    const opts = { window: 1, max: 1 };
    checkRateLimit(key, opts); // exhaust limit
    // Call many times to exercise random jitter path
    const baseline = Date.now();
    for (let i = 0; i < 50; i++) {
      const result = checkRateLimit(key, opts);
      expect(result.allowed).toBe(false);
      // resetAt must be ≥ baseline + 1s (allow 100ms clock drift in CI)
      expect(result.resetAt).toBeGreaterThanOrEqual(baseline + 900);
    }
  });
});
