import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────
vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  }
  return { ActionError, defineAction: (def: any) => def };
});

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: vi.fn(),
    update: mockUpdate,
    delete: vi.fn(),
  })),
}));

vi.mock('@database/schemas', () => ({
  pages: { id: 'id' },
  pageLocks: {},
  pageSections: {},
  pageVersions: {},
}));

// Verrou des pages = verrou générique core/locks sur un stockage mémoire (même politique que Postgres).
const { lockRows } = vi.hoisted(() => ({ lockRows: new Map<string, { userId: string; sessionId: string; lockedAt: Date; expiresAt: Date }>() }));
vi.mock('@/lib/pages/locks', async () => {
  const { defineLockResource } = await import('@/core/locks/service');
  const { memoryLockStore } = await import('../helpers/memory-lock-store');
  const { store } = memoryLockStore(lockRows);
  return { PAGE_LOCK_TTL_MS: 5 * 60 * 1000, pageLock: defineLockResource('page-test', store, { ttlMs: 5 * 60 * 1000, tenantOf: () => (async () => null)() as never }) };
});

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock('@i18n/config', () => ({ LOCALES: ['fr', 'en', 'es', 'ar'] as const }));

const mockUserHasPermission = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: mockUserHasPermission } },
}));

import { lockPage as _lock, unlockPage as _unlock } from '@/actions/admin/pages';

const lockPage = _lock as unknown as { handler: (...a: any[]) => Promise<any> };
const unlockPage = _unlock as unknown as { handler: (...a: any[]) => Promise<any> };

function ctx(userId = 'admin-1', sessionId = 'sess-1') {
  return {
    locals: { user: { id: userId, role: 'admin', email: 'a@test.com' }, session: { id: sessionId } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

function selectChain(rows: unknown[]) {
  const chain: any = { from: () => chain, where: () => chain, limit: () => Promise.resolve(rows) };
  return chain;
}

describe('Content Locking (pages → core/locks)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockRows.clear();
    mockSelect.mockImplementation(() => selectChain([{ id: 'p1' }]));
  });

  describe('lockPage', () => {
    it('acquires lock on unlocked page', async () => {
      const result = await lockPage.handler({ id: 'p1' }, ctx());
      expect(result).toMatchObject({ success: true, lockedBy: 'admin-1' });
      expect(lockRows.get('p1')).toMatchObject({ userId: 'admin-1', sessionId: 'sess-1' });
    });

    it('refreshes lock when same user re-locks from the same session', async () => {
      await lockPage.handler({ id: 'p1' }, ctx());
      const first = lockRows.get('p1')!.expiresAt;
      await new Promise((r) => setTimeout(r, 5));
      await lockPage.handler({ id: 'p1' }, ctx());
      expect(lockRows.get('p1')!.expiresAt.getTime()).toBeGreaterThan(first.getTime());
    });

    it('rejects lock when page is locked by another user', async () => {
      await lockPage.handler({ id: 'p1' }, ctx('admin-2', 'sess-2'));
      await expect(lockPage.handler({ id: 'p1' }, ctx())).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('allows lock steal when existing lock is expired', async () => {
      lockRows.clear();
      await lockPage.handler({ id: 'p1' }, ctx('admin-2', 'sess-2'));
      // Expire le verrou d'admin-2 dans le stockage.
      const row = lockRows.get('p1')!;
      row.lockedAt = new Date(Date.now() - 10 * 60 * 1000);
      row.expiresAt = new Date(Date.now() - 1000);
      const result = await lockPage.handler({ id: 'p1' }, ctx());
      expect(result).toMatchObject({ success: true, lockedBy: 'admin-1' });
    });

    it('same user, other session: confirmation prompt, then audited takeover', async () => {
      await lockPage.handler({ id: 'p1' }, ctx('admin-1', 'tab-1'));
      const prompt = await lockPage.handler({ id: 'p1' }, ctx('admin-1', 'tab-2'));
      expect(prompt.success).toBe(false);
      expect(prompt.takeOverPrompt).toMatch(/autre session/);
      const taken = await lockPage.handler({ id: 'p1', takeOver: true }, ctx('admin-1', 'tab-2'));
      expect(taken.success).toBe(true);
      expect(lockRows.get('p1')!.sessionId).toBe('tab-2');
      const { logAuditEvent } = await import('@/lib/audit');
      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'PAGE_LOCK_TAKEOVER', metadata: { previousSessionId: 'tab-1' } }));
    });

    it('throws NOT_FOUND for missing page', async () => {
      mockSelect.mockImplementation(() => selectChain([]));
      await expect(lockPage.handler({ id: 'missing' }, ctx())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('unlockPage', () => {
    it('releases the own lock only', async () => {
      await lockPage.handler({ id: 'p1' }, ctx());
      await unlockPage.handler({ id: 'p1' }, ctx('admin-2', 'sess-2'));
      expect(lockRows.has('p1')).toBe(true);
      const result = await unlockPage.handler({ id: 'p1' }, ctx());
      expect(result).toEqual({ success: true });
      expect(lockRows.has('p1')).toBe(false);
    });
  });
});
