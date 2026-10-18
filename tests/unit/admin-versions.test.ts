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
const mockTransaction = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
  })),
}));

vi.mock('@database/schemas', () => ({
  pages: { id: 'id', updatedAt: 'updatedAt' },
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

// Mock sanitizeSectionContent — imported by versions.ts from sections.ts
vi.mock('@/actions/admin/sections', () => ({
  sanitizeSectionContent: vi.fn((raw: string | Record<string, unknown>) => {
    if (typeof raw === 'string') return JSON.parse(raw);
    return raw;
  }),
}));
const mockUserHasPermission = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: mockUserHasPermission } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import {
  createPageVersion as _create,
  listPageVersions as _list,
  restorePageVersion as _restore,
} from '@/actions/admin/versions';

const createPageVersion = _create as unknown as { handler: (...a: any[]) => Promise<any> };
const listPageVersions = _list as unknown as { handler: (...a: any[]) => Promise<any> };
const restorePageVersion = _restore as unknown as { handler: (...a: any[]) => Promise<any> };

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
      orderBy: vi.fn().mockReturnValue(terminal),
    }),
  };
}

function selectOrderedChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
  });
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue(terminal),
      }),
    }),
  };
}

function insertChain(rows: any[]) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) };
}

beforeEach(() => {
  mockSelect.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockTransaction.mockReset();
});

// ─── createPageVersion ──────────────────────────────────────────────

describe('createPageVersion', () => {
  it('creates a version snapshot', async () => {
    const page = { id: 'p1', locale: 'fr', slug: 'about', title: 'About', createdAt: new Date(), updatedAt: new Date() };
    const sections = [{ id: 's1', type: 'text', content: { html: 'Hello' }, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }];
    const created = { id: 'v1', pageId: 'p1', versionNumber: 1 };

    // Fetch page
    mockSelect.mockReturnValueOnce(selectChain([page]));
    // Fetch sections
    mockSelect.mockReturnValueOnce(selectOrderedChain(sections));
    // Latest version number
    mockSelect.mockReturnValueOnce(selectOrderedChain([]));
    // Insert
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await createPageVersion.handler({ pageId: 'p1', note: 'Test' }, adminCtx());
    expect(result).toEqual(created);
  });

  it('throws NOT_FOUND for missing page', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      createPageVersion.handler({ pageId: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('increments version number', async () => {
    const page = { id: 'p1', locale: 'fr', slug: 'x', title: 'X', createdAt: new Date(), updatedAt: new Date() };
    mockSelect.mockReturnValueOnce(selectChain([page]));
    mockSelect.mockReturnValueOnce(selectOrderedChain([]));
    mockSelect.mockReturnValueOnce(selectOrderedChain([{ versionNumber: 5 }]));

    const created = { id: 'v2', pageId: 'p1', versionNumber: 6 };
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await createPageVersion.handler({ pageId: 'p1' }, adminCtx());
    expect(result.versionNumber).toBe(6);
  });

  it('rejects non-admin', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = { locals: { user: { id: 'u1', role: 'user' } }, request: { headers: new Headers() } } as any;
    await expect(
      createPageVersion.handler({ pageId: 'p1' }, ctx),
    ).rejects.toThrow('Permissions insuffisantes');
  });});

// ─── listPageVersions ───────────────────────────────────────────────

describe('listPageVersions', () => {
  it('lists versions for a page', async () => {
    const versions = [
      { id: 'v2', versionNumber: 2, createdBy: 'admin-1', note: null, createdAt: new Date() },
      { id: 'v1', versionNumber: 1, createdBy: 'admin-1', note: 'init', createdAt: new Date() },
    ];
    mockSelect.mockReturnValueOnce(selectOrderedChain(versions));

    const result = await listPageVersions.handler({ pageId: 'p1' }, adminCtx());
    expect(result).toHaveLength(2);
    expect(result[0].versionNumber).toBe(2);
  });

  it('returns empty array for page with no versions', async () => {
    mockSelect.mockReturnValueOnce(selectOrderedChain([]));

    const result = await listPageVersions.handler({ pageId: 'p1' }, adminCtx());
    expect(result).toEqual([]);
  });
});

// ─── restorePageVersion ─────────────────────────────────────────────

describe('restorePageVersion', () => {
  it('restores from a version (with auto-snapshot before restore)', async () => {
    const versionSnapshot = {
      page: { id: 'p1', locale: 'fr', slug: 'about', title: 'Old Title' },
      sections: [
        { id: 's-old', type: 'text', content: { html: 'Old content' }, sortOrder: 0 },
      ],
    };
    const version = {
      id: 'v1', pageId: 'p1', versionNumber: 1, snapshot: versionSnapshot, createdAt: new Date(),
    };

    // Fetch version to restore
    mockSelect.mockReturnValueOnce(selectChain([version]));

    // Transaction mock
    mockTransaction.mockImplementation(async (cb: any) => {
      const tx = {
        select: vi.fn()
          // Current page
          .mockReturnValueOnce(selectChain([{
            id: 'p1', locale: 'fr', slug: 'about', title: 'Current', createdAt: new Date(), updatedAt: new Date(),
          }]))
          // Current sections
          .mockReturnValueOnce(selectOrderedChain([]))
          // Latest version number
          .mockReturnValueOnce(selectOrderedChain([{ versionNumber: 1 }])),
        insert: vi.fn().mockReturnValue(insertChain([{ id: 'v-pre' }])),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{}]),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      };
      return cb(tx);
    });

    const result = await restorePageVersion.handler({ versionId: 'v1' }, adminCtx());
    expect(result.success).toBe(true);
    expect(result.restoredVersion).toBe(1);
  });

  it('throws NOT_FOUND for missing version', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      restorePageVersion.handler({ versionId: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('rejects non-admin', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = { locals: { user: { id: 'u1', role: 'user' } }, request: { headers: new Headers() } } as any;
    await expect(
      restorePageVersion.handler({ versionId: 'v1' }, ctx),
    ).rejects.toThrow('Permissions insuffisantes');
  });

  it('throws on corrupted snapshot (missing page or sections)', async () => {
    const version = {
      id: 'v-bad', pageId: 'p1', versionNumber: 1,
      snapshot: { corrupted: true }, // missing page + sections
      createdAt: new Date(),
    };
    mockSelect.mockReturnValueOnce(selectChain([version]));

    await expect(
      restorePageVersion.handler({ versionId: 'v-bad' }, adminCtx()),
    ).rejects.toThrow('corrompu');
  });

  it('throws on null snapshot', async () => {
    const version = {
      id: 'v-null', pageId: 'p1', versionNumber: 1,
      snapshot: null,
      createdAt: new Date(),
    };
    mockSelect.mockReturnValueOnce(selectChain([version]));

    await expect(
      restorePageVersion.handler({ versionId: 'v-null' }, adminCtx()),
    ).rejects.toThrow('corrompu');
  });
});
