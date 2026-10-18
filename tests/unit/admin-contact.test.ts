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

const mockUpdate = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({ update: mockUpdate })),
}));

vi.mock('@database/schemas', () => ({
  contactInfo: { id: 'id' },
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
import { updateContactInfo as _update } from '@/actions/admin/contact';

const updateContact = _update as unknown as { input: any; handler: (...a: any[]) => Promise<any> };

function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com' } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
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
  mockUpdate.mockReset();
});

// ─── updateContactInfo ──────────────────────────────────────────────

describe('updateContactInfo', () => {
  it('updates contact info', async () => {
    const updated = { id: 'c1', email: 'a@b.com', phone: '+33123456789' };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await updateContact.handler(
      { id: 'c1', email: 'a@b.com', phone: '+33123456789' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND when contact info missing', async () => {
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      updateContact.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvables');
  });

  it('rejects non-admin', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = {
      locals: { user: { id: 'u1', role: 'user' } },
      request: { headers: new Headers() },
    } as any;
    await expect(
      updateContact.handler({ id: 'c1' }, ctx),
    ).rejects.toThrow('Permissions insuffisantes');
  });
});

// ─── Input (Zod) validation ─────────────────────────────────────────

describe('updateContactInfo input validation', () => {
  const schema = updateContact.input;

  it('accepts valid full input', () => {
    const r = schema.safeParse({
      id: 'c1', email: 'test@example.com', phone: '+33123',
      latitude: '48.8566', longitude: '2.3522',
    });
    expect(r.success).toBe(true);
  });

  it('rejects latitude without longitude', () => {
    const r = schema.safeParse({ id: 'c1', latitude: '48.8566' });
    expect(r.success).toBe(false);
  });

  it('rejects longitude without latitude', () => {
    const r = schema.safeParse({ id: 'c1', longitude: '2.3522' });
    expect(r.success).toBe(false);
  });

  it('accepts both lat/lon as null', () => {
    const r = schema.safeParse({ id: 'c1', latitude: null, longitude: null });
    expect(r.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const r = schema.safeParse({ id: 'c1', email: 'bad' });
    expect(r.success).toBe(false);
  });

  it('rejects latitude out of range', () => {
    const r = schema.safeParse({ id: 'c1', latitude: '91.0', longitude: '2.0' });
    expect(r.success).toBe(false);
  });

  it('rejects mapUrl without http', () => {
    const r = schema.safeParse({ id: 'c1', mapUrl: 'ftp://map.example.com' });
    expect(r.success).toBe(false);
  });
});
