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
const mockTransaction = vi.fn(async (fn: any) =>
  fn({ select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete }),
);

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
  navigationItems: { id: 'id', menuId: 'menuId', parentId: 'parentId', locale: 'locale', label: 'label', sortOrder: 'sortOrder' },
  navigationMenus: { id: 'id', name: 'name' },
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
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: vi.fn(() => Promise.resolve({ success: true })) } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import {
  createNavigationItem as _create,
  updateNavigationItem as _update,
  deleteNavigationItem as _del,
  reorderNavigationItems as _reorder,
} from '@/actions/admin/navigation';

const createItem = _create as unknown as { handler: (...a: any[]) => Promise<any> };
const updateItem = _update as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteItem = _del as unknown as { handler: (...a: any[]) => Promise<any> };
const reorderItems = _reorder as unknown as { handler: (...a: any[]) => Promise<any> };

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
    orderBy: vi.fn().mockReturnValue(Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
    })),
  });
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminal),
      orderBy: vi.fn().mockReturnValue(terminal),
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
  mockTransaction.mockImplementation(async (fn: any) =>
    fn({ select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete }),
  );
});

// ─── createNavigationItem ───────────────────────────────────────────

describe('createNavigationItem', () => {
  it('creates an item when menu exists', async () => {
    const created = { id: 'i1', menuId: 'm1', label: 'Home', locale: 'fr' };
    // menu exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'm1' }]));
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await createItem.handler(
      { menuId: 'm1', label: 'Home', locale: 'fr' },
      adminCtx(),
    );
    expect(result).toEqual(created);
  });

  it('throws when menu does not exist', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      createItem.handler({ menuId: 'nope', label: 'Home', locale: 'fr' }, adminCtx()),
    ).rejects.toThrow("n'existe pas");
  });

  it('throws when parent does not exist', async () => {
    // menu exists
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'm1' }]));
    // parent check
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      createItem.handler(
        { menuId: 'm1', parentId: 'p-nope', label: 'Sub', locale: 'fr' },
        adminCtx(),
      ),
    ).rejects.toThrow('parent');
  });

  it('rejects unauthenticated users', async () => {
    const ctx = { locals: { user: null }, request: { headers: new Headers() } } as any;
    await expect(
      createItem.handler({ menuId: 'm1', label: 'x', locale: 'fr' }, ctx),
    ).rejects.toThrow('connecté');
  });
});

// ─── updateNavigationItem ───────────────────────────────────────────

describe('updateNavigationItem', () => {
  it('updates an item', async () => {
    const updated = { id: 'i1', label: 'Updated' };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await updateItem.handler(
      { id: 'i1', label: 'Updated' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND when item missing', async () => {
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      updateItem.handler({ id: 'nope', label: 'x' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── deleteNavigationItem ───────────────────────────────────────────

describe('deleteNavigationItem', () => {
  it('deletes an item', async () => {
    mockDelete.mockReturnValue(deleteChain([{ id: 'i1', label: 'Home' }]));

    const result = await deleteItem.handler({ id: 'i1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when item missing', async () => {
    mockDelete.mockReturnValue(deleteChain([]));

    await expect(
      deleteItem.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── reorderNavigationItems ─────────────────────────────────────────

describe('reorderNavigationItems', () => {
  it('reorders items from the same menu', async () => {
    // existing items query
    mockSelect.mockReturnValueOnce(selectChain([
      { id: 'i1', menuId: 'm1' },
      { id: 'i2', menuId: 'm1' },
    ]));
    // individual update calls
    mockUpdate
      .mockReturnValueOnce(updateChain([{ id: 'i1' }]))
      .mockReturnValueOnce(updateChain([{ id: 'i2' }]));

    const result = await reorderItems.handler(
      { items: [{ id: 'i1', sortOrder: 0 }, { id: 'i2', sortOrder: 1 }] },
      adminCtx(),
    );
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when some items missing', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'i1', menuId: 'm1' }]));

    await expect(
      reorderItems.handler(
        { items: [{ id: 'i1', sortOrder: 0 }, { id: 'i2', sortOrder: 1 }] },
        adminCtx(),
      ),
    ).rejects.toThrow('introuvables');
  });

  it('throws when items belong to different menus', async () => {
    mockSelect.mockReturnValueOnce(selectChain([
      { id: 'i1', menuId: 'm1' },
      { id: 'i2', menuId: 'm2' },
    ]));

    await expect(
      reorderItems.handler(
        { items: [{ id: 'i1', sortOrder: 0 }, { id: 'i2', sortOrder: 1 }] },
        adminCtx(),
      ),
    ).rejects.toThrow('même menu');
  });
});
