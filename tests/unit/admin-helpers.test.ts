import { describe, it, expect, vi } from 'vitest';

// Mock astro:actions — vi.mock is hoisted, so class must be inside factory
vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  }
  return { ActionError };
});

const mockLogAudit = vi.fn();
vi.mock('@/lib/audit', () => ({
  logAuditEvent: (...args: any[]) => mockLogAudit(...args),
  extractIp: vi.fn(() => '127.0.0.1'),
}));

import { assertAdmin, adminRateLimit, auditAdmin } from '@/actions/admin/_helpers';

function fakeContext(user: any = null): any {
  return {
    locals: { user },
    request: { headers: new Headers() },
  };
}

describe('assertAdmin', () => {
  it('throws UNAUTHORIZED when user is null', () => {
    expect(() => assertAdmin(fakeContext(null))).toThrow('connecté');
  });

  it('throws FORBIDDEN when user is not admin', () => {
    expect(() => assertAdmin(fakeContext({ id: 'u1', role: 'user' }))).toThrow('administrateurs');
  });

  it('returns the user when admin', () => {
    const admin = { id: 'a1', role: 'admin', email: 'admin@test.com' };
    const result = assertAdmin(fakeContext(admin));
    expect(result).toBe(admin);
  });

  it('throws FORBIDDEN when admin is banned', () => {
    expect(() => assertAdmin(fakeContext({ id: 'a2', role: 'admin', banned: true }))).toThrow('suspendu');
  });
});

describe('adminRateLimit', () => {
  it('does not throw when under the limit', () => {
    const scope = `test-ok-${Date.now()}-${Math.random()}`;
    expect(() =>
      adminRateLimit(fakeContext({ id: 'u1', role: 'admin' }), 'u1', scope, { window: 60, max: 100 }),
    ).not.toThrow();
  });

  it('throws TOO_MANY_REQUESTS when limit is exceeded', () => {
    const ctx = fakeContext({ id: 'u-rl', role: 'admin' });
    const scope = `rl-block-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      adminRateLimit(ctx, 'u-rl', scope, { window: 60, max: 3 });
    }
    expect(() => adminRateLimit(ctx, 'u-rl', scope, { window: 60, max: 3 })).toThrow('requêtes');
  });
});

describe('auditAdmin', () => {
  it('does not throw when logAuditEvent rejects', async () => {
    mockLogAudit.mockRejectedValueOnce(new Error('DB down'));

    const ctx = {
      request: { headers: new Headers() },
      clientAddress: '10.0.0.1',
    } as any;

    // auditAdmin is fire-and-forget — must not throw
    expect(() => auditAdmin(ctx, 'u1', 'PAGE_CREATE' as any)).not.toThrow();

    // Give microtask queue time to settle — rejection must be swallowed
    await new Promise((r) => setTimeout(r, 10));
  });
});
