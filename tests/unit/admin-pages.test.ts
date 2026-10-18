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
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  })),
}));

vi.mock('@database/schemas', () => ({
  pages: { id: 'id', updatedAt: 'updatedAt', locale: 'locale', sortOrder: 'sortOrder', deletedAt: 'deletedAt' },
  pageSections: { id: 'id', pageId: 'pageId', sortOrder: 'sortOrder' },
  pageVersions: { id: 'id', pageId: 'pageId', versionNumber: 'versionNumber' },
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
const mockUserHasPermission = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: mockUserHasPermission } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import {
  createPage as _create,
  updatePage as _update,
  deletePage as _del,
  publishPage as _publish,
  schedulePage as _sched,
  unschedulePage as _unsched,
  restoreFromTrash as _restore,
  permanentlyDeletePage as _permDel,
  bulkPublishPages as _bulkPub,
  bulkArchivePages as _bulkArch,
} from '@/actions/admin/pages';

const createPage = _create as unknown as { handler: (...a: any[]) => Promise<any> };
const updatePage = _update as unknown as { handler: (...a: any[]) => Promise<any> };
const deletePage = _del as unknown as { handler: (...a: any[]) => Promise<any> };
const publishPage = _publish as unknown as { handler: (...a: any[]) => Promise<any> };
const schedulePage = _sched as unknown as { handler: (...a: any[]) => Promise<any> };
const unschedulePage = _unsched as unknown as { handler: (...a: any[]) => Promise<any> };
const restoreFromTrash = _restore as unknown as { handler: (...a: any[]) => Promise<any> };
const permanentlyDeletePage = _permDel as unknown as { handler: (...a: any[]) => Promise<any> };
const bulkPublishPages = _bulkPub as unknown as { handler: (...a: any[]) => Promise<any> };
const bulkArchivePages = _bulkArch as unknown as { handler: (...a: any[]) => Promise<any> };

function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com' } },
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
function insertChain(rows: any[]) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) };
}
function updateChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    returning: vi.fn().mockResolvedValue(rows),
  });
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminal),
    }),
  };
}
function deleteChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    returning: vi.fn().mockResolvedValue(rows),
  });
  return { where: vi.fn().mockReturnValue(terminal) };
}

beforeEach(() => {
  mockSelect.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
});

// ─── createPage ─────────────────────────────────────────────────────

describe('createPage', () => {
  it('creates a page', async () => {
    const created = { id: 'p1', slug: 'about', title: 'About', locale: 'fr' };
    // Auto-sortOrder select
    mockSelect.mockReturnValueOnce(selectChain([{ maxSort: 0 }]));
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await createPage.handler(
      { slug: 'about', title: 'About', locale: 'fr' },
      adminCtx(),
    );
    expect(result).toEqual(created);
  });

  it('throws CONFLICT on duplicate slug', async () => {
    const dbError = new Error('dup') as any;
    dbError.code = '23505';
    // Auto-sortOrder select
    mockSelect.mockReturnValueOnce(selectChain([{ maxSort: 0 }]));
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(dbError) }),
    });

    await expect(
      createPage.handler({ slug: 'about', title: 'About', locale: 'fr' }, adminCtx()),
    ).rejects.toThrow('existe déjà');
  });

  it('throws on reserved slug', async () => {
    await expect(
      createPage.handler({ slug: 'admin', title: 'Admin', locale: 'fr' }, adminCtx()),
    ).rejects.toThrow('réservé');
  });

  it('rejects non-admin', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = {
      locals: { user: { id: 'u1', role: 'user' } },
      request: { headers: new Headers() },
    } as any;
    await expect(
      createPage.handler({ slug: 'x', title: 'X', locale: 'fr' }, ctx),
    ).rejects.toThrow('Permissions insuffisantes');
  });
});

// ─── updatePage ─────────────────────────────────────────────────────

describe('updatePage', () => {
  it('updates a page', async () => {
    const updated = { id: 'p1', title: 'Updated' };
    // Lock check select
    mockSelect.mockReturnValueOnce(selectChain([{ lockedBy: null, lockedAt: null }]));
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await updatePage.handler(
      { id: 'p1', title: 'Updated' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND when page missing', async () => {
    // Lock check select
    mockSelect.mockReturnValueOnce(selectChain([]));
    mockUpdate.mockReturnValue(updateChain([]));
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      updatePage.handler({ id: 'nope', title: 'x' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('throws CONFLICT on optimistic lock failure', async () => {
    // Lock check select
    mockSelect.mockReturnValueOnce(selectChain([{ lockedBy: null, lockedAt: null }]));
    mockUpdate.mockReturnValue(updateChain([]));
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'p1' }]));

    await expect(
      updatePage.handler(
        { id: 'p1', title: 'x', expectedUpdatedAt: '2024-01-01T00:00:00Z' },
        adminCtx(),
      ),
    ).rejects.toThrow('modifiée par un autre');
  });

  it('throws CONFLICT on duplicate slug during update', async () => {
    const dbError = new Error('dup') as any;
    dbError.code = '23505';
    // Lock check select
    mockSelect.mockReturnValueOnce(selectChain([{ lockedBy: null, lockedAt: null }]));
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(dbError) }),
      }),
    });

    await expect(
      updatePage.handler({ id: 'p1', slug: 'taken' }, adminCtx()),
    ).rejects.toThrow('utilise déjà');
  });

  it('throws on reserved slug during update', async () => {
    await expect(
      updatePage.handler({ id: 'p1', slug: 'api' }, adminCtx()),
    ).rejects.toThrow('réservé');
  });
});

// ─── deletePage ─────────────────────────────────────────────────────

describe('deletePage', () => {
  it('soft-deletes a page', async () => {
    mockUpdate.mockReturnValue(updateChain([{ id: 'p1', title: 'About' }]));

    const result = await deletePage.handler({ id: 'p1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when page missing', async () => {
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      deletePage.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── publishPage ────────────────────────────────────────────────────

describe('publishPage', () => {
  it('publishes a page', async () => {
    const updated = { id: 'p1', isPublished: true };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await publishPage.handler(
      { id: 'p1', isPublished: true },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('unpublishes a page', async () => {
    const updated = { id: 'p1', isPublished: false };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await publishPage.handler(
      { id: 'p1', isPublished: false },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND when page missing', async () => {
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      publishPage.handler({ id: 'nope', isPublished: true }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── schedulePage ───────────────────────────────────────────────────

describe('schedulePage', () => {
  it('schedules a page for future publication', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const updated = { id: 'p1', scheduledAt: new Date(future), isPublished: false };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await schedulePage.handler({ id: 'p1', scheduledAt: future }, adminCtx());
    expect(result.scheduledAt).toBeDefined();
  });

  it('throws NOT_FOUND when page missing', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      schedulePage.handler({ id: 'nope', scheduledAt: future }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── unschedulePage ─────────────────────────────────────────────────

describe('unschedulePage', () => {
  it('removes schedule from a page', async () => {
    const updated = { id: 'p1', scheduledAt: null };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await unschedulePage.handler({ id: 'p1' }, adminCtx());
    expect(result.scheduledAt).toBeNull();
  });

  it('throws NOT_FOUND when page missing', async () => {
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      unschedulePage.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── restoreFromTrash ───────────────────────────────────────────────

describe('restoreFromTrash', () => {
  it('restores a trashed page', async () => {
    const restored = { id: 'p1', title: 'About' };
    mockUpdate.mockReturnValue(updateChain([restored]));

    const result = await restoreFromTrash.handler({ id: 'p1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when page missing', async () => {
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      restoreFromTrash.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── permanentlyDeletePage ──────────────────────────────────────────

describe('permanentlyDeletePage', () => {
  it('permanently deletes a trashed page', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'p1', title: 'Old', deletedAt: new Date() }]));
    mockDelete.mockReturnValue(deleteChain([]));

    const result = await permanentlyDeletePage.handler({ id: 'p1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when page missing', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      permanentlyDeletePage.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('refuses to delete a non-trashed page', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'p1', title: 'Live', deletedAt: null }]));

    await expect(
      permanentlyDeletePage.handler({ id: 'p1' }, adminCtx()),
    ).rejects.toThrow('corbeille');
  });
});

// ─── bulkPublishPages ───────────────────────────────────────────────

describe('bulkPublishPages', () => {
  it('publishes multiple pages', async () => {
    mockUpdate.mockReturnValue(updateChain([{ id: 'p1' }, { id: 'p2' }]));

    const result = await bulkPublishPages.handler(
      { ids: ['p1', 'p2'], isPublished: true },
      adminCtx(),
    );
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });

  it('unpublishes multiple pages', async () => {
    mockUpdate.mockReturnValue(updateChain([{ id: 'p1' }]));

    const result = await bulkPublishPages.handler(
      { ids: ['p1'], isPublished: false },
      adminCtx(),
    );
    expect(result.count).toBe(1);
  });
});

// ─── bulkArchivePages ───────────────────────────────────────────────

describe('bulkArchivePages', () => {
  it('archives multiple pages', async () => {
    mockUpdate.mockReturnValue(updateChain([{ id: 'p1' }, { id: 'p2' }]));

    const result = await bulkArchivePages.handler({ ids: ['p1', 'p2'] }, adminCtx());
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
  });
});
