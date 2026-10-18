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
  pages: { id: 'id', lockedBy: 'lockedBy', lockedAt: 'lockedAt' },
  pageSections: {},
  pageVersions: {},
}));

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

function adminCtx(userId = 'admin-1') {
  return {
    locals: { user: { id: userId, role: 'admin', email: 'a@test.com' } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

function selectChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
  });
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminal),
    }),
  };
}

function updateChain() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

beforeEach(() => {
  mockSelect.mockReset();
  mockUpdate.mockReset();
});

describe('Content Locking', () => {
  describe('lockPage', () => {
    it('acquires lock on unlocked page', async () => {
      mockSelect.mockReturnValueOnce(selectChain([{ lockedBy: null, lockedAt: null }]));
      mockUpdate.mockReturnValue(updateChain());

      const result = await lockPage.handler({ id: 'p1' }, adminCtx());
      expect(result.success).toBe(true);
      expect(result.lockedBy).toBe('admin-1');
    });

    it('refreshes lock when same user re-locks', async () => {
      const freshLock = new Date();
      mockSelect.mockReturnValueOnce(selectChain([{ lockedBy: 'admin-1', lockedAt: freshLock }]));
      mockUpdate.mockReturnValue(updateChain());

      const result = await lockPage.handler({ id: 'p1' }, adminCtx());
      expect(result.success).toBe(true);
    });

    it('rejects lock when page is locked by another user', async () => {
      const freshLock = new Date();
      mockSelect.mockReturnValueOnce(selectChain([{ lockedBy: 'admin-2', lockedAt: freshLock }]));

      await expect(
        lockPage.handler({ id: 'p1' }, adminCtx()),
      ).rejects.toThrow('en cours de modification');
    });

    it('allows lock steal when existing lock is expired', async () => {
      const expiredLock = new Date(Date.now() - 10 * 60 * 1000); // 10 min old
      mockSelect.mockReturnValueOnce(selectChain([{ lockedBy: 'admin-2', lockedAt: expiredLock }]));
      mockUpdate.mockReturnValue(updateChain());

      const result = await lockPage.handler({ id: 'p1' }, adminCtx());
      expect(result.success).toBe(true);
    });

    it('throws NOT_FOUND for missing page', async () => {
      mockSelect.mockReturnValueOnce(selectChain([]));

      await expect(
        lockPage.handler({ id: 'missing' }, adminCtx()),
      ).rejects.toThrow('introuvable');
    });
  });

  describe('unlockPage', () => {
    it('releases the lock', async () => {
      mockUpdate.mockReturnValue(updateChain());

      const result = await unlockPage.handler({ id: 'p1' }, adminCtx());
      expect(result.success).toBe(true);
    });
  });
});
