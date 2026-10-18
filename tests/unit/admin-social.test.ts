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
  socialLinks: { id: 'id', sortOrder: 'sortOrder' },
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
  createSocialLink as _create,
  updateSocialLink as _update,
  deleteSocialLink as _del,
  reorderSocialLinks as _reorder,
} from '@/actions/admin/social';

const createLink = _create as unknown as { handler: (...a: any[]) => Promise<any> };
const updateLink = _update as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteLink = _del as unknown as { handler: (...a: any[]) => Promise<any> };
const reorderLinks = _reorder as unknown as { handler: (...a: any[]) => Promise<any> };

function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com' } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
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

// ─── createSocialLink ───────────────────────────────────────────────

describe('createSocialLink', () => {
  it('creates a social link', async () => {
    const created = { id: 'sl1', platform: 'Twitter', url: 'https://twitter.com/test' };
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await createLink.handler(
      { platform: 'Twitter', url: 'https://twitter.com/test' },
      adminCtx(),
    );
    expect(result).toEqual(created);
  });

  it('throws CONFLICT on duplicate platform', async () => {
    const dbError = new Error('dup') as any;
    dbError.code = '23505';
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockRejectedValue(dbError) }),
    });

    await expect(
      createLink.handler({ platform: 'Twitter', url: 'https://twitter.com/test' }, adminCtx()),
    ).rejects.toThrow('existe déjà');
  });

  it('rejects non-admin', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = {
      locals: { user: { id: 'u1', role: 'user' } },
      request: { headers: new Headers() },
    } as any;
    await expect(
      createLink.handler({ platform: 'X', url: 'https://x.com' }, ctx),
    ).rejects.toThrow('Permissions insuffisantes');
  });
});

// ─── updateSocialLink ───────────────────────────────────────────────

describe('updateSocialLink', () => {
  it('updates a social link', async () => {
    const updated = { id: 'sl1', platform: 'X' };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await updateLink.handler(
      { id: 'sl1', platform: 'X' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND when link missing', async () => {
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      updateLink.handler({ id: 'nope', platform: 'X' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── deleteSocialLink ───────────────────────────────────────────────

describe('deleteSocialLink', () => {
  it('deletes a social link', async () => {
    mockDelete.mockReturnValue(deleteChain([{ id: 'sl1' }]));

    const result = await deleteLink.handler({ id: 'sl1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when link missing', async () => {
    mockDelete.mockReturnValue(deleteChain([]));

    await expect(
      deleteLink.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── reorderSocialLinks ─────────────────────────────────────────────

describe('reorderSocialLinks', () => {
  it('reorders social links', async () => {
    const reorderUpdate: any = {
      set: vi.fn(() => reorderUpdate),
      where: vi.fn(() => reorderUpdate),
      returning: vi.fn(() => reorderUpdate),
      then: (res: any, rej: any) => Promise.resolve([{ id: 'sl1' }, { id: 'sl2' }]).then(res, rej),
    };
    mockUpdate.mockReturnValue(reorderUpdate);

    const result = await reorderLinks.handler(
      { items: [{ id: 'sl1', sortOrder: 0 }, { id: 'sl2', sortOrder: 1 }] },
      adminCtx(),
    );
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when some links missing', async () => {
    const reorderUpdate: any = {
      set: vi.fn(() => reorderUpdate),
      where: vi.fn(() => reorderUpdate),
      returning: vi.fn(() => reorderUpdate),
      then: (res: any, rej: any) => Promise.resolve([{ id: 'sl1' }]).then(res, rej),
    };
    mockUpdate.mockReturnValue(reorderUpdate);

    await expect(
      reorderLinks.handler(
        { items: [{ id: 'sl1', sortOrder: 0 }, { id: 'sl2', sortOrder: 1 }] },
        adminCtx(),
      ),
    ).rejects.toThrow('introuvables');
  });
});
