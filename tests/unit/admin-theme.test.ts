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
const mockExecute = vi.fn();
const mockTransaction = vi.fn(async (fn: any) =>
  fn({ select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete, execute: mockExecute }),
);

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
    execute: mockExecute,
  })),
}));

vi.mock('@database/schemas', () => ({
  themeSettings: { id: 'id', isActive: 'isActive' },
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
  createTheme as _create,
  updateTheme as _update,
  deleteTheme as _del,
} from '@/actions/admin/theme';

const createTheme = _create as unknown as { handler: (...a: any[]) => Promise<any> };
const updateTheme = _update as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteTheme = _del as unknown as { handler: (...a: any[]) => Promise<any> };

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
function selectChainNoLimit(rows: any[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
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
function deleteChain() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  mockSelect.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockExecute.mockReset();
  mockTransaction.mockImplementation(async (fn: any) =>
    fn({ select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete, execute: mockExecute }),
  );
});

// ─── createTheme ────────────────────────────────────────────────────

describe('createTheme', () => {
  it('creates a theme (auto-activate when no active theme)', async () => {
    const created = { id: 't1', name: 'My Theme', isActive: true };
    // No active theme exists
    mockSelect.mockReturnValueOnce(selectChain([]));
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await createTheme.handler({ name: 'My Theme' }, adminCtx());
    expect(result).toEqual(created);
  });

  it('creates a theme (no auto-activate when active theme exists)', async () => {
    const created = { id: 't2', name: 'Second', isActive: false };
    mockSelect.mockReturnValueOnce(selectChain([{ id: 't1' }]));
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await createTheme.handler({ name: 'Second' }, adminCtx());
    expect(result).toEqual(created);
  });

  it('rejects non-admin', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = {
      locals: { user: { id: 'u1', role: 'user' } },
      request: { headers: new Headers() },
    } as any;
    await expect(createTheme.handler({ name: 'x' }, ctx)).rejects.toThrow('Permissions insuffisantes');
  });
});

// ─── updateTheme ────────────────────────────────────────────────────

describe('updateTheme', () => {
  it('updates a theme', async () => {
    const updated = { id: 't1', name: 'Renamed', isActive: true };
    mockExecute.mockResolvedValue(undefined);
    mockUpdate
      .mockReturnValueOnce(updateChain([updated]));

    const result = await updateTheme.handler(
      { id: 't1', name: 'Renamed' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('deactivates others when activating a theme', async () => {
    const updated = { id: 't2', name: 'B', isActive: true };
    mockExecute.mockResolvedValue(undefined);
    // Deactivate all active → then update this one
    mockUpdate
      .mockReturnValueOnce(updateChain([]))  // deactivate others
      .mockReturnValueOnce(updateChain([updated]));

    const result = await updateTheme.handler(
      { id: 't2', isActive: true },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('throws when deactivating the only active theme', async () => {
    mockExecute.mockResolvedValue(undefined);
    // Active themes query returns only this theme
    mockSelect.mockReturnValueOnce(selectChainNoLimit([{ id: 't1' }]));

    await expect(
      updateTheme.handler({ id: 't1', isActive: false }, adminCtx()),
    ).rejects.toThrow('seul thème actif');
  });

  it('throws NOT_FOUND when theme missing', async () => {
    mockExecute.mockResolvedValue(undefined);
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      updateTheme.handler({ id: 'nope', name: 'x' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── deleteTheme ────────────────────────────────────────────────────

describe('deleteTheme', () => {
  it('deletes an inactive theme', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ id: 't2', name: 'B', isActive: false }]));
    mockDelete.mockReturnValue(deleteChain());

    const result = await deleteTheme.handler({ id: 't2' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws when deleting the active theme', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ id: 't1', name: 'A', isActive: true }]));

    await expect(
      deleteTheme.handler({ id: 't1' }, adminCtx()),
    ).rejects.toThrow('thème actif');
  });

  it('throws NOT_FOUND when theme missing', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      deleteTheme.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});
