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
const mockUpdate = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    select: mockSelect,
    update: mockUpdate,
  })),
}));

vi.mock('@database/schemas', () => ({
  consentSettings: { id: 'id', locale: 'locale' },
}));

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock('@i18n/utils', () => ({
  isValidLocale: vi.fn((l: string) => ['fr', 'en', 'es', 'ar'].includes(l)),
}));
const mockUserHasPermission = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: mockUserHasPermission } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import { updateConsentSettings as _update } from '@/actions/admin/consent';
import { invalidateCache } from '@database/cache';

const updateConsent = _update as unknown as { handler: (...a: any[]) => Promise<any> };

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
  mockUpdate.mockReset();
  vi.mocked(invalidateCache).mockClear();
});

describe('updateConsentSettings', () => {
  it('updates consent settings for a locale', async () => {
    const result = { id: 'c1', locale: 'fr', title: 'Cookies' };
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'c1' }]));
    mockUpdate.mockReturnValue(updateChain([result]));

    const res = await updateConsent.handler(
      { locale: 'fr', title: 'Cookies' },
      adminCtx(),
    );
    expect(res).toEqual(result);
    expect(invalidateCache).toHaveBeenCalledWith('consent:settings:fr');
  });

  it('throws NOT_FOUND when no consent config exists for locale', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      updateConsent.handler({ locale: 'en', title: 'X' }, adminCtx()),
    ).rejects.toThrow('consentement');
  });

  it('throws BAD_REQUEST for invalid locale', async () => {
    await expect(
      updateConsent.handler({ locale: 'xx', title: 'X' }, adminCtx()),
    ).rejects.toThrow('invalide');
  });

  it('rejects non-admin', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = {
      locals: { user: { id: 'u1', role: 'user' } },
      request: { headers: new Headers() },
    } as any;
    await expect(
      updateConsent.handler({ locale: 'fr', title: 'X' }, ctx),
    ).rejects.toThrow('Permissions insuffisantes');
  });

  it('passes isActive and privacyPolicyUrl fields', async () => {
    const result = { id: 'c1', locale: 'fr', isActive: false, privacyPolicyUrl: '/privacy' };
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'c1' }]));
    mockUpdate.mockReturnValue(updateChain([result]));

    const res = await updateConsent.handler(
      { locale: 'fr', isActive: false, privacyPolicyUrl: '/privacy' },
      adminCtx(),
    );
    expect(res.isActive).toBe(false);
    expect(res.privacyPolicyUrl).toBe('/privacy');
  });
});
