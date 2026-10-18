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
const mockTransaction = vi.fn(async (fn: any) =>
  fn({ select: mockSelect, insert: mockInsert, update: mockUpdate }),
);

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  })),
}));

vi.mock('@database/schemas', () => ({
  siteSettings: { id: 'id', locale: 'locale' },
}));

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock('@i18n/utils', () => ({ isValidLocale: vi.fn((l: string) => ['fr', 'en', 'es', 'ar'].includes(l)) }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: vi.fn(() => Promise.resolve({ success: true })) } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import {
  upsertSiteSettings as _upsert,
  updateSiteSettings as _update,
} from '@/actions/admin/site';

const upsertSite = _upsert as unknown as { handler: (...a: any[]) => Promise<any> };
const updateSite = _update as unknown as { handler: (...a: any[]) => Promise<any> };

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

beforeEach(() => {
  mockSelect.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
});

// ─── upsertSiteSettings ────────────────────────────────────────────

describe('upsertSiteSettings', () => {
  it('updates existing settings', async () => {
    const result = { id: 's1', locale: 'fr', siteName: 'Updated' };
    mockSelect.mockReturnValueOnce(selectChain([{ id: 's1' }]));
    mockUpdate.mockReturnValue(updateChain([result]));

    const res = await upsertSite.handler(
      { locale: 'fr', siteName: 'Updated' },
      adminCtx(),
    );
    expect(res).toEqual(result);
  });

  it('inserts new settings', async () => {
    const result = { id: 's2', locale: 'en', siteName: 'New' };
    mockSelect.mockReturnValueOnce(selectChain([]));
    mockInsert.mockReturnValue(insertChain([result]));

    const res = await upsertSite.handler(
      { locale: 'en', siteName: 'New' },
      adminCtx(),
    );
    expect(res).toEqual(result);
  });

  it('throws when creating without siteName', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      upsertSite.handler({ locale: 'en' }, adminCtx()),
    ).rejects.toThrow('requis');
  });

  it('throws on invalid locale', async () => {
    await expect(
      upsertSite.handler({ locale: 'xx', siteName: 'Test' }, adminCtx()),
    ).rejects.toThrow('invalide');
  });
});

// ─── updateSiteSettings ────────────────────────────────────────────

describe('updateSiteSettings', () => {
  it('updates existing settings by id', async () => {
    const updated = { id: 's1', siteName: 'Renamed', locale: 'fr' };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await updateSite.handler(
      { id: 's1', siteName: 'Renamed' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('invalidates locale-scoped cache key', async () => {
    const { invalidateCache } = await import('@database/cache');
    const updated = { id: 's1', siteName: 'X', locale: 'en' };
    mockUpdate.mockReturnValue(updateChain([updated]));

    await updateSite.handler({ id: 's1', siteName: 'X' }, adminCtx());
    expect(invalidateCache).toHaveBeenCalledWith('site:settings:en');
  });

  it('throws NOT_FOUND when setting missing', async () => {
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      updateSite.handler({ id: 'nope', siteName: 'x' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});
