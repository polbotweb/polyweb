import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted) ────────────────────────────────────────────────
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

function chainable(finalValue: any) {
  const proxy: any = new Proxy(() => finalValue, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined; // prevent auto-await of proxy
      return () => proxy;
    },
    apply: () => proxy,
  });
  // Make .limit(1) / .returning() / etc. return the final value
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(finalValue),
      }),
    }),
    values: () => ({
      returning: () => Promise.resolve(finalValue),
    }),
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve(finalValue),
      }),
    }),
    where: () => ({
      returning: () => Promise.resolve(finalValue),
    }),
  };
}

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  })),
}));

vi.mock('@database/schemas', () => ({
  navigationMenus: { id: 'id', name: 'name' },
}));

vi.mock('@database/cache', () => ({
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));

const mockUserHasPermission = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: mockUserHasPermission } },
}));

// ── Import SUT ──────────────────────────────────────────────────────
// defineAction is mocked to return { input, handler } directly,
// but Astro's real types hide .handler — cast to access it in tests.
import {
  createNavigationMenu as _create,
  updateNavigationMenu as _update,
  deleteNavigationMenu as _delete,
} from '@/actions/admin/menus';

const createNavigationMenu = _create as unknown as { handler: (...args: any[]) => Promise<any> };
const updateNavigationMenu = _update as unknown as { handler: (...args: any[]) => Promise<any> };
const deleteNavigationMenu = _delete as unknown as { handler: (...args: any[]) => Promise<any> };

// ── Helpers ─────────────────────────────────────────────────────────
function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com' } },
    request: { headers: new Headers() },
  } as any;
}

function userCtx() {
  return {
    locals: { user: { id: 'user-1', role: 'user' } },
    request: { headers: new Headers() },
  } as any;
}

function noAuthCtx() {
  return {
    locals: { user: null },
    request: { headers: new Headers() },
  } as any;
}

// ── Tests ───────────────────────────────────────────────────────────
describe('createNavigationMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserHasPermission.mockResolvedValue({ success: true });
  });

  it('rejects unauthenticated users', async () => {
    await expect(
      createNavigationMenu.handler({ name: 'main' }, noAuthCtx()),
    ).rejects.toThrow('connecté');
  });

  it('rejects non-admin users', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    await expect(
      createNavigationMenu.handler({ name: 'main' }, userCtx()),
    ).rejects.toThrow('Permissions insuffisantes');
  });

  it('creates a menu when name is unique', async () => {
    // Insert returns new menu
    const newMenu = { id: 'menu-1', name: 'main', description: null };
    mockInsert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.resolve([newMenu]) }),
    });

    const result = await createNavigationMenu.handler({ name: 'main' }, adminCtx());
    expect(result).toEqual(newMenu);
  });

  it('throws CONFLICT when name already exists', async () => {
    const dbError = Object.assign(new Error('unique violation'), { code: '23505' });
    mockInsert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.reject(dbError) }),
    });

    await expect(
      createNavigationMenu.handler({ name: 'main' }, adminCtx()),
    ).rejects.toThrow('existe déjà');
  });
});

describe('updateNavigationMenu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates a menu', async () => {
    // Protected check returns non-protected menu
    mockSelect.mockReturnValueOnce(chainable([{ name: 'custom' }]));
    // Update returns updated
    const updated = { id: 'menu-1', name: 'footer', description: null };
    mockUpdate.mockReturnValueOnce({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([updated]) }),
      }),
    });

    const result = await updateNavigationMenu.handler(
      { id: 'menu-1', name: 'footer' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND when menu does not exist', async () => {
    // Protected check returns non-protected
    mockSelect.mockReturnValueOnce(chainable([{ name: 'custom' }]));
    // Update returns empty
    mockUpdate.mockReturnValueOnce({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([]) }),
      }),
    });

    await expect(
      updateNavigationMenu.handler({ id: 'nope', name: 'x' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('throws FORBIDDEN when renaming a protected menu', async () => {
    mockSelect.mockReturnValueOnce(chainable([{ name: 'header' }]));

    await expect(
      updateNavigationMenu.handler({ id: 'menu-1', name: 'new-name' }, adminCtx()),
    ).rejects.toThrow('système');
  });
});

describe('deleteNavigationMenu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a menu', async () => {
    // Protected check returns non-protected menu
    mockSelect.mockReturnValueOnce(chainable([{ name: 'custom' }]));
    mockDelete.mockReturnValueOnce({
      where: () => ({
        returning: () => Promise.resolve([{ id: 'menu-1', name: 'custom' }]),
      }),
    });

    const result = await deleteNavigationMenu.handler({ id: 'menu-1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when menu does not exist', async () => {
    mockSelect.mockReturnValueOnce(chainable([]));

    await expect(
      deleteNavigationMenu.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('throws FORBIDDEN when deleting a protected menu', async () => {
    mockSelect.mockReturnValueOnce(chainable([{ name: 'footer_primary' }]));

    await expect(
      deleteNavigationMenu.handler({ id: 'menu-1' }, adminCtx()),
    ).rejects.toThrow('système');
  });
});
