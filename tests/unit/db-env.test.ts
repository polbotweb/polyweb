import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

/**
 * Tests the REAL DB_POOL_MAX clamping logic from src/database/env.ts.
 * Uses vi.resetModules() + dynamic import so the module-level POOL_CONFIGS
 * constant is re-evaluated with the modified process.env.DB_POOL_MAX.
 */
describe('DB_POOL_MAX clamping — getPoolConfig("PROD")', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, DB_ENV: 'PROD', DATABASE_URL_PROD: 'postgresql://u:p@localhost/db' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to 20 when DB_POOL_MAX is undefined', async () => {
    delete process.env.DB_POOL_MAX;
    const { getPoolConfig } = await import('@database/env');
    expect(getPoolConfig('PROD').max).toBe(20);
  });

  it('treats "0" as invalid (falls back to 20)', async () => {
    process.env.DB_POOL_MAX = '0';
    const { getPoolConfig } = await import('@database/env');
    expect(getPoolConfig('PROD').max).toBe(20);
  });

  it('clamps negative value to 1', async () => {
    process.env.DB_POOL_MAX = '-5';
    const { getPoolConfig } = await import('@database/env');
    expect(getPoolConfig('PROD').max).toBe(1);
  });

  it('clamps excessive value to 100', async () => {
    process.env.DB_POOL_MAX = '999999';
    const { getPoolConfig } = await import('@database/env');
    expect(getPoolConfig('PROD').max).toBe(100);
  });

  it('keeps valid value as-is', async () => {
    process.env.DB_POOL_MAX = '50';
    const { getPoolConfig } = await import('@database/env');
    expect(getPoolConfig('PROD').max).toBe(50);
  });

  it('falls back to 20 for non-numeric string', async () => {
    process.env.DB_POOL_MAX = 'abc';
    const { getPoolConfig } = await import('@database/env');
    expect(getPoolConfig('PROD').max).toBe(20);
  });
});

// ─── DB_ENV validation ──────────────────────────────────────────────

describe('DB_ENV validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, DATABASE_URL_LOCAL: 'postgresql://u:p@localhost/local' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to LOCAL when DB_ENV is undefined', async () => {
    delete process.env.DB_ENV;
    const { getDbEnv } = await import('@database/env');
    expect(getDbEnv()).toBe('LOCAL');
  });

  it('defaults to LOCAL when DB_ENV is empty', async () => {
    process.env.DB_ENV = '';
    const { getDbEnv } = await import('@database/env');
    expect(getDbEnv()).toBe('LOCAL');
  });

  it('normalizes lowercase to uppercase', async () => {
    process.env.DB_ENV = 'test';
    process.env.DATABASE_URL_TEST = 'postgresql://u:p@localhost/test';
    const { getDbEnv } = await import('@database/env');
    expect(getDbEnv()).toBe('TEST');
  });

  it('throws for invalid DB_ENV value', async () => {
    process.env.DB_ENV = 'STAGING';
    await expect(import('@database/env')).rejects.toThrow('DB_ENV invalide');
  });
});

// ─── getDbUrl / getDbConfig / getConnectionLabel ────────────────────

describe('getDbUrl / getDbConfig / getConnectionLabel', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DB_ENV: 'TEST',
      DATABASE_URL_TEST: 'postgresql://u:p@localhost:5432/atomic_test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('getDbUrl returns the active env URL', async () => {
    const { getDbUrl } = await import('@database/env');
    expect(getDbUrl()).toBe('postgresql://u:p@localhost:5432/atomic_test');
  });

  it('getDbUrl with explicit env returns that env URL', async () => {
    process.env.DATABASE_URL_PROD = 'postgresql://u:p@prod-host/proddb';
    const { getDbUrl } = await import('@database/env');
    expect(getDbUrl('PROD')).toBe('postgresql://u:p@prod-host/proddb');
  });

  it('getDbUrl with explicit env returns correct URL', async () => {
    process.env.DATABASE_URL_LOCAL = 'postgresql://u:p@localhost/local';
    const { getDbUrl } = await import('@database/env');
    expect(getDbUrl('TEST')).toBe('postgresql://u:p@localhost:5432/atomic_test');
  });

  it('getConnectionLabel returns human-readable label', async () => {
    const { getConnectionLabel } = await import('@database/env');
    expect(getConnectionLabel()).toBe('test');
    expect(getConnectionLabel('PROD')).toBe('production');
    expect(getConnectionLabel('LOCAL')).toBe('local/dev');
  });

  it('getDbConfig returns complete configuration', async () => {
    const { getDbConfig } = await import('@database/env');
    const config = getDbConfig();
    expect(config.env).toBe('TEST');
    expect(config.url).toBe('postgresql://u:p@localhost:5432/atomic_test');
    expect(config.poolConfig.max).toBe(5);
  });

  it('isProd / isTest / isLocal reflect active env', async () => {
    const { isProd, isTest, isLocal } = await import('@database/env');
    expect(isProd()).toBe(false);
    expect(isTest()).toBe(true);
    expect(isLocal()).toBe(false);
  });
});
