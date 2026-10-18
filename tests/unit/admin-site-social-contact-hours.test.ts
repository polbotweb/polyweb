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

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  })),
}));

vi.mock('@database/schemas', () => ({
  siteSettings: { id: 'id' },
  socialLinks: { id: 'id' },
  contactInfo: { id: 'id' },
  openingHours: { id: 'id' },
}));

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: vi.fn(() => Promise.resolve({ success: true })) } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import { updateSiteSettings as _updateSite } from '@/actions/admin/site';
import {
  createSocialLink as _createSocial,
  updateSocialLink as _updateSocial,
  deleteSocialLink as _deleteSocial,
} from '@/actions/admin/social';
import { updateContactInfo as _updateContact } from '@/actions/admin/contact';
import { updateOpeningHours as _updateHours } from '@/actions/admin/hours';

const updateSiteSettings = _updateSite as unknown as { handler: (...a: any[]) => Promise<any> };
const createSocialLink = _createSocial as unknown as { handler: (...a: any[]) => Promise<any> };
const updateSocialLink = _updateSocial as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteSocialLink = _deleteSocial as unknown as { handler: (...a: any[]) => Promise<any> };
const updateContactInfo = _updateContact as unknown as { handler: (...a: any[]) => Promise<any> };
const updateOpeningHours = _updateHours as unknown as { handler: (...a: any[]) => Promise<any> };

// ── Helpers ─────────────────────────────────────────────────────────
function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com' } },
    request: { headers: new Headers() },
  } as any;
}

function noAuthCtx() {
  return { locals: { user: null }, request: { headers: new Headers() } } as any;
}

function mockUpdateReturning(rows: any[]) {
  mockUpdate.mockReturnValueOnce({
    set: () => ({ where: () => ({ returning: () => Promise.resolve(rows) }) }),
  });
}

function mockDeleteReturning(rows: any[]) {
  mockDelete.mockReturnValueOnce({
    where: () => ({ returning: () => Promise.resolve(rows) }),
  });
}

function mockInsertReturning(rows: any[]) {
  mockInsert.mockReturnValueOnce({
    values: () => ({ returning: () => Promise.resolve(rows) }),
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SITE SETTINGS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('updateSiteSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated users', async () => {
    await expect(
      updateSiteSettings.handler({ id: 's1', siteName: 'Test' }, noAuthCtx()),
    ).rejects.toThrow('connecté');
  });

  it('updates site settings', async () => {
    const updated = { id: 's1', siteName: 'New', locale: 'fr' };
    mockUpdateReturning([updated]);
    const result = await updateSiteSettings.handler({ id: 's1', siteName: 'New' }, adminCtx());
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND when id does not exist', async () => {
    mockUpdateReturning([]);
    await expect(
      updateSiteSettings.handler({ id: 'bad', siteName: 'X' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SOCIAL LINKS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('createSocialLink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a social link', async () => {
    const link = { id: 'sl-1', platform: 'twitter', url: 'https://x.com/test' };
    mockInsertReturning([link]);
    const result = await createSocialLink.handler(
      { platform: 'twitter', url: 'https://x.com/test' },
      adminCtx(),
    );
    expect(result).toEqual(link);
  });
});

describe('updateSocialLink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NOT_FOUND when link does not exist', async () => {
    mockUpdateReturning([]);
    await expect(
      updateSocialLink.handler({ id: 'bad', platform: 'x' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

describe('deleteSocialLink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a social link', async () => {
    mockDeleteReturning([{ id: 'sl-1', platform: 'twitter' }]);
    const result = await deleteSocialLink.handler({ id: 'sl-1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when link missing', async () => {
    mockDeleteReturning([]);
    await expect(
      deleteSocialLink.handler({ id: 'bad' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONTACT INFO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('updateContactInfo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates contact info', async () => {
    const updated = { id: 'ci-1', email: 'new@test.com' };
    mockUpdateReturning([updated]);
    const result = await updateContactInfo.handler({ id: 'ci-1', email: 'new@test.com' }, adminCtx());
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND', async () => {
    mockUpdateReturning([]);
    await expect(
      updateContactInfo.handler({ id: 'bad' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OPENING HOURS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('updateOpeningHours', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated users', async () => {
    await expect(
      updateOpeningHours.handler({ items: [{ id: 'h1' }] }, noAuthCtx()),
    ).rejects.toThrow('connecté');
  });
});
