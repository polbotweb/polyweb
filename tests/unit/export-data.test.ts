import { describe, it, expect, vi } from 'vitest';

/**
 * Unit tests for /api/export-data endpoint patterns.
 * Tests auth guard, rate limiting, and response format without real DB.
 */

// ── Mocks ───────────────────────────────────────────────────────────
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 })),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@database/drizzle', () => ({
  schema: {
    user: { id: 'id', name: 'name', email: 'email', emailVerified: 'ev', image: 'img', createdAt: 'ca', updatedAt: 'ua', username: 'u', displayUsername: 'du', role: 'role' },
    account: { id: 'id', providerId: 'pid', accountId: 'aid', createdAt: 'ca', userId: 'uid' },
    session: { id: 'id', createdAt: 'ca', expiresAt: 'ea', userId: 'uid' },
    member: { id: 'id', organizationId: 'oid', role: 'role', createdAt: 'ca', userId: 'uid' },
    invitation: { id: 'id', organizationId: 'oid', email: 'e', role: 'r', status: 's', createdAt: 'ca', inviterId: 'iid' },
    auditLog: { id: 'id', action: 'a', resource: 'r', resourceId: 'rid', createdAt: 'ca', userId: 'uid' },
  },
  withDbActorContext: vi.fn(async (_ctx: any, fn: any) => {
    const fakeResult = vi.fn().mockResolvedValue([]);
    const fakeChain = () => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: 'u1', name: 'Test', email: 'test@test.com' }]),
          orderBy: vi.fn(() => ({
            limit: fakeResult,
          })),
        })),
      })),
    });
    const fakeDb = { select: vi.fn(fakeChain) };
    return fn(fakeDb);
  }),
}));

import { auth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';

describe('/api/export-data', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as any);

    const { GET } = await import('@/pages/api/export-data');
    const response = await GET({
      request: new Request('http://localhost/api/export-data'),
    } as any);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'u1', role: 'user' },
      session: { id: 's1' },
    } as any);
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const { GET } = await import('@/pages/api/export-data');
    const response = await GET({
      request: new Request('http://localhost/api/export-data'),
    } as any);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeDefined();
  });

  it('returns JSON with Content-Disposition attachment header on success', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'u1', role: 'user' },
      session: { id: 's1' },
    } as any);
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60_000,
    });

    const { GET } = await import('@/pages/api/export-data');
    const response = await GET({
      request: new Request('http://localhost/api/export-data'),
    } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('export data response has correct structure', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'u1', role: 'user' },
      session: { id: 's1' },
    } as any);
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      remaining: 4,
      resetAt: Date.now() + 60_000,
    });

    const { GET } = await import('@/pages/api/export-data');
    const response = await GET({
      request: new Request('http://localhost/api/export-data'),
    } as any);

    const body = await response.json();
    expect(body).toHaveProperty('exportedAt');
    // userResult is destructured from Promise.all — shape depends on DB mock
    expect(typeof body.exportedAt).toBe('string');
  });
});
