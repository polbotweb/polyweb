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
  navigationMenus: {
    id: 'id',
    name: 'name',
    description: 'description',
  },
}));

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
const mockUserHasPermission = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: mockUserHasPermission } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import {
  createNavigationMenu as _create,
  updateNavigationMenu as _update,
  deleteNavigationMenu as _del,
} from '@/actions/admin/menus';

const createMenu = _create as unknown as { handler: (...a: any[]) => Promise<any> };
const updateMenu = _update as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteMenu = _del as unknown as { handler: (...a: any[]) => Promise<any> };

function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com' } },
    request: { headers: new Headers() },
  } as any;
}

function insertChain(rows: any[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function updateChain(rows: any[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function deleteChain(rows: any[]) {
  return {
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function selectChain(rows: any[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createNavigationMenu ───────────────────────────────────────────

describe('createNavigationMenu', () => {
  it('creates a new menu', async () => {
    const created = { id: 'm1', name: 'main', description: null };
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await createMenu.handler({ name: 'main' }, adminCtx());
    expect(result).toEqual(created);
  });

  it('throws CONFLICT on duplicate name', async () => {
    const dbError = new Error('duplicate key') as any;
    dbError.code = '23505';
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(dbError),
      }),
    });

    await expect(
      createMenu.handler({ name: 'main' }, adminCtx()),
    ).rejects.toThrow('existe déjà');
  });

  it('throws UNAUTHORIZED with no user', async () => {
    const ctx = { locals: { user: null }, request: { headers: new Headers() } } as any;
    await expect(
      createMenu.handler({ name: 'test' }, ctx),
    ).rejects.toThrow('connecté');
  });

  it('throws FORBIDDEN for non-admin', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = {
      locals: { user: { id: 'u1', role: 'user' } },
      request: { headers: new Headers() },
    } as any;
    await expect(
      createMenu.handler({ name: 'test' }, ctx),
    ).rejects.toThrow('Permissions insuffisantes');
  });
});

// ─── updateNavigationMenu ───────────────────────────────────────────

describe('updateNavigationMenu', () => {
  it('updates an existing menu', async () => {
    const updated = { id: 'm1', name: 'updated', description: 'desc' };
    mockSelect.mockReturnValueOnce(selectChain([{ name: 'custom' }]));
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await updateMenu.handler(
      { id: 'm1', name: 'updated', description: 'desc' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND when menu does not exist', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ name: 'custom' }]));
    mockUpdate.mockReturnValue(updateChain([])); // not found

    await expect(
      updateMenu.handler({ id: 'nope', name: 'x' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('throws CONFLICT when another menu uses the name', async () => {
    const dbError = new Error('duplicate key') as any;
    dbError.code = '23505';
    mockSelect.mockReturnValueOnce(selectChain([{ name: 'custom' }]));
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(dbError),
        }),
      }),
    });

    await expect(
      updateMenu.handler({ id: 'm1', name: 'taken' }, adminCtx()),
    ).rejects.toThrow('utilise déjà');
  });

  it('throws FORBIDDEN when renaming a protected menu', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ name: 'header' }]));

    await expect(
      updateMenu.handler({ id: 'm1', name: 'new-name' }, adminCtx()),
    ).rejects.toThrow('système');
  });

  it('allows updating description of a protected menu', async () => {
    const updated = { id: 'm1', name: 'header', description: 'new-desc' };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await updateMenu.handler(
      { id: 'm1', description: 'new-desc' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });
});

// ─── deleteNavigationMenu ───────────────────────────────────────────

describe('deleteNavigationMenu', () => {
  it('deletes an existing menu', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ name: 'custom' }]));
    mockDelete.mockReturnValue(deleteChain([{ id: 'm1', name: 'custom' }]));

    const result = await deleteMenu.handler({ id: 'm1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when menu does not exist', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      deleteMenu.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('throws FORBIDDEN when deleting a protected menu', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ name: 'header' }]));

    await expect(
      deleteMenu.handler({ id: 'm1' }, adminCtx()),
    ).rejects.toThrow('système');
  });

  it('requires admin role', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = {
      locals: { user: { id: 'u1', role: 'user' } },
      request: { headers: new Headers() },
    } as any;
    await expect(
      deleteMenu.handler({ id: 'm1' }, ctx),
    ).rejects.toThrow('Permissions insuffisantes');
  });
});
