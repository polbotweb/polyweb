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
const mockTransaction = vi.fn(async (fn: any) => fn({ update: mockUpdate }));

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({
    update: mockUpdate,
    transaction: mockTransaction,
  })),
}));

vi.mock('@database/schemas', () => ({
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
const mockUserHasPermission = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: mockUserHasPermission } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import { updateOpeningHours as _update } from '@/actions/admin/hours';

const updateHours = _update as unknown as { input: any; handler: (...a: any[]) => Promise<any> };

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
  mockTransaction.mockImplementation(async (fn: any) =>
    fn({ update: mockUpdate }),
  );
});

// ─── updateOpeningHours ─────────────────────────────────────────────

describe('updateOpeningHours', () => {
  it('updates hours for valid items', async () => {
    const row = { id: 'h1', openTime: '09:00', closeTime: '18:00', isClosed: false };
    mockUpdate.mockReturnValue(updateChain([row]));

    const result = await updateHours.handler(
      { items: [{ id: 'h1', openTime: '09:00', closeTime: '18:00', isClosed: false }] },
      adminCtx(),
    );
    expect(result).toEqual([row]);
  });

  it('handles closed days (no openTime/closeTime required)', async () => {
    const row = { id: 'h2', isClosed: true };
    mockUpdate.mockReturnValue(updateChain([row]));

    const result = await updateHours.handler(
      { items: [{ id: 'h2', isClosed: true }] },
      adminCtx(),
    );
    expect(result).toEqual([row]);
  });

  it('throws NOT_FOUND when hour not found', async () => {
    mockUpdate.mockReturnValue(updateChain([]));

    await expect(
      updateHours.handler(
        { items: [{ id: 'nope', openTime: '09:00', closeTime: '18:00', isClosed: false }] },
        adminCtx(),
      ),
    ).rejects.toThrow('introuvable');
  });

  it('rejects non-admin', async () => {
    mockUserHasPermission.mockResolvedValueOnce({ success: false });
    const ctx = {
      locals: { user: { id: 'u1', role: 'user' } },
      request: { headers: new Headers() },
    } as any;
    await expect(
      updateHours.handler({ items: [{ id: 'h1', isClosed: true }] }, ctx),
    ).rejects.toThrow('Permissions insuffisantes');
  });
});

// ─── Input (Zod) validation ─────────────────────────────────────────

describe('updateOpeningHours input validation', () => {
  const schema = updateHours.input;

  it('accepts valid open day', () => {
    const r = schema.safeParse({
      items: [{ id: 'h1', openTime: '09:00', closeTime: '18:00', isClosed: false }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts closed day without times', () => {
    const r = schema.safeParse({ items: [{ id: 'h1', isClosed: true }] });
    expect(r.success).toBe(true);
  });

  it('rejects invalid time format', () => {
    const r = schema.safeParse({
      items: [{ id: 'h1', openTime: '9:00', closeTime: '18:00', isClosed: false }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects time with hours > 23', () => {
    const r = schema.safeParse({
      items: [{ id: 'h1', openTime: '25:00', closeTime: '18:00', isClosed: false }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects open day without times', () => {
    const r = schema.safeParse({
      items: [{ id: 'h1', isClosed: false }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects closeTime before openTime', () => {
    const r = schema.safeParse({
      items: [{ id: 'h1', openTime: '18:00', closeTime: '09:00', isClosed: false }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects midday break without all 4 times', () => {
    const r = schema.safeParse({
      items: [{ id: 'h1', openTime: '09:00', closeTime: '18:00', isClosed: false, hasMiddayBreak: true, morningOpen: '09:00' }],
    });
    expect(r.success).toBe(false);
  });

  it('accepts valid midday break', () => {
    const r = schema.safeParse({
      items: [{
        id: 'h1', openTime: '09:00', closeTime: '18:00', isClosed: false,
        hasMiddayBreak: true, morningOpen: '09:00', morningClose: '12:00',
        afternoonOpen: '14:00', afternoonClose: '18:00',
      }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects midday break where afternoon opens before morning closes', () => {
    const r = schema.safeParse({
      items: [{
        id: 'h1', openTime: '09:00', closeTime: '18:00', isClosed: false,
        hasMiddayBreak: true, morningOpen: '09:00', morningClose: '14:00',
        afternoonOpen: '12:00', afternoonClose: '18:00',
      }],
    });
    expect(r.success).toBe(false);
  });
});
