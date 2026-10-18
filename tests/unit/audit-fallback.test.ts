import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FALLBACK_PATTERN = /^audit-fallback-\d{4}-\d{2}-\d{2}\.jsonl$/;

function getFallbackPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(process.cwd(), 'logs', `audit-fallback-${date}.jsonl`);
}

function cleanupFallbacks() {
  const logsDir = join(process.cwd(), 'logs');
  if (!existsSync(logsDir)) return;
  for (const f of readdirSync(logsDir)) {
    if (FALLBACK_PATTERN.test(f)) unlinkSync(join(logsDir, f));
  }
}

// Mock drizzle to throw
vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(() => { throw new Error('DB connection lost'); }),
    })),
  })),
}));

vi.mock('@database/schemas', () => ({
  auditLog: {},
}));

import { logAuditEvent } from '@/lib/audit';

describe('logAuditEvent — JSONL fallback', () => {
  beforeEach(() => {
    cleanupFallbacks();
  });

  afterEach(() => {
    cleanupFallbacks();
  });

  it('writes to fallback file when DB insert fails', async () => {
    await logAuditEvent({
      userId: 'user-1',
      action: 'SIGN_IN',
      resource: 'auth',
      ipAddress: '1.2.3.4',
      userAgent: 'test-agent',
    });

    const fallbackPath = getFallbackPath();

    // Poll for file existence instead of fragile setTimeout
    await vi.waitFor(() => {
      if (!existsSync(fallbackPath)) throw new Error('File not yet created');
      const content = readFileSync(fallbackPath, 'utf-8');
      if (!content.includes('SIGN_IN')) throw new Error('Entry not yet written');
    }, { timeout: 2000, interval: 50 });

    const lines = readFileSync(fallbackPath, 'utf-8').trim().split('\n');
    const entry = lines
      .map(l => JSON.parse(l))
      .find((e: any) => e.action === 'SIGN_IN' && e.userId === 'user-1');

    expect(entry).toBeDefined();
    expect(entry.action).toBe('SIGN_IN');
    expect(entry.userId).toBe('user-1');
    expect(entry.timestamp).toBeDefined();
  });
});
