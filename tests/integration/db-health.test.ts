import { describe, it, expect } from 'vitest';
import { checkConnection, getDrizzle, getLazyDrizzle } from '@database/drizzle';

describe('Database — Health', () => {
  it('checkConnection returns ok with valid latency', async () => {
    const result = await checkConnection();
    expect(result.ok).toBe(true);
    expect(result.latency).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it('getDrizzle returns the same instance (singleton)', () => {
    const db1 = getDrizzle();
    const db2 = getDrizzle();
    expect(db1).toBe(db2);
  });

  it('can execute a raw query via drizzle', async () => {
    const db = getDrizzle();
    const result = await db.execute('SELECT 1 as val');
    expect(result).toBeDefined();
  });

  it('getLazyDrizzle proxy delegates to current instance', async () => {
    const lazy = getLazyDrizzle();
    const result = await lazy.execute('SELECT 1 as val');
    expect(result).toBeDefined();
  });
});
