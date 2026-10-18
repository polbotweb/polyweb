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
const mockTxSelect = vi.fn();
const mockTxUpdate = vi.fn();
const mockTxDelete = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    transaction: vi.fn(async (fn: any) => {
      const tx = {
        select: mockTxSelect,
        update: mockTxUpdate,
        delete: mockTxDelete,
      };
      return fn(tx);
    }),
  })),
}));

vi.mock('@database/schemas', () => ({
  pages: { id: 'id', locale: 'locale', slug: 'slug', title: 'title', isActive: 'is_active', sortOrder: 'sortOrder', deletedAt: 'deletedAt' },
  pageSections: { id: 'id', pageId: 'page_id' },
  themeSettings: { id: 'id', isActive: 'is_active' },
}));

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock('@i18n/config', () => ({
  LOCALES: ['fr', 'en', 'es', 'ar'] as const,
  DEFAULT_LOCALE: 'fr',
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: vi.fn(() => Promise.resolve({ success: true })) } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import {
  createPage as _createPage,
  deletePage as _deletePage,
} from '@/actions/admin/pages';
import {
  createTheme as _createTheme,
  deleteTheme as _deleteTheme,
} from '@/actions/admin/theme';

const createPage = _createPage as unknown as { handler: (...a: any[]) => Promise<any> };
const deletePage = _deletePage as unknown as { handler: (...a: any[]) => Promise<any> };
const createTheme = _createTheme as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteTheme = _deleteTheme as unknown as { handler: (...a: any[]) => Promise<any> };

function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com' } },
    request: { headers: new Headers() },
  } as any;
}

function selectChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
  });
  return {
    from: () => ({
      where: () => terminal,
    }),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGES — createPage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('createPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a page when slug is unique for locale', async () => {
    const newPage = { id: 'p1', locale: 'fr', slug: 'about', title: 'À propos' };
    // Auto-sortOrder select
    mockSelect.mockReturnValueOnce(selectChain([{ maxSort: 0 }]));
    mockInsert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.resolve([newPage]) }),
    });

    const result = await createPage.handler(
      { locale: 'fr', slug: 'about', title: 'À propos' },
      adminCtx(),
    );
    expect(result).toEqual(newPage);
  });

  it('throws CONFLICT when slug+locale already exists', async () => {
    const dbError = Object.assign(new Error('unique violation'), { code: '23505' });
    // Auto-sortOrder select
    mockSelect.mockReturnValueOnce(selectChain([{ maxSort: 0 }]));
    mockInsert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.reject(dbError) }),
    });

    await expect(
      createPage.handler({ locale: 'fr', slug: 'about', title: 'X' }, adminCtx()),
    ).rejects.toThrow('existe déjà');
  });
});

describe('deletePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('soft-deletes a page', async () => {
    mockUpdate.mockReturnValueOnce({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: 'p1', title: 'X' }]),
        }),
      }),
    });
    const result = await deletePage.handler({ id: 'p1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND', async () => {
    mockUpdate.mockReturnValueOnce({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    });
    await expect(deletePage.handler({ id: 'bad' }, adminCtx())).rejects.toThrow('introuvable');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// THEME — createTheme + deleteTheme constraints
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('createTheme', () => {
  beforeEach(() => vi.clearAllMocks());

  it('auto-activates if no active theme exists', async () => {
    // select().from().where().limit() → no active theme
    mockSelect.mockReturnValueOnce(selectChain([]));
    const theme = { id: 't1', name: 'Dark', isActive: true };
    mockInsert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.resolve([theme]) }),
    });
    const result = await createTheme.handler({ name: 'Dark' }, adminCtx());
    expect(result.isActive).toBe(true);
  });

  it('creates inactive theme when an active theme already exists', async () => {
    // select().from().where().limit() → one active theme
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'existing' }]));
    const theme = { id: 't2', name: 'Alt', isActive: false };
    mockInsert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.resolve([theme]) }),
    });
    const result = await createTheme.handler({ name: 'Alt' }, adminCtx());
    expect(result.isActive).toBe(false);
  });
});

describe('deleteTheme', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NOT_FOUND when theme does not exist', async () => {
    mockTxSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      deleteTheme.handler({ id: 'bad' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('throws BAD_REQUEST when trying to delete active theme', async () => {
    mockTxSelect.mockReturnValueOnce(selectChain([{ id: 't1', isActive: true }]));

    await expect(
      deleteTheme.handler({ id: 't1' }, adminCtx()),
    ).rejects.toThrow('thème actif');
  });

  it('deletes an inactive theme', async () => {
    mockTxSelect.mockReturnValueOnce(selectChain([{ id: 't2', isActive: false }]));
    mockTxDelete.mockReturnValueOnce({
      where: () => Promise.resolve(),
    });
    const result = await deleteTheme.handler({ id: 't2' }, adminCtx());
    expect(result).toEqual({ success: true });
  });
});
