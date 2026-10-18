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
  user: { id: 'id', bio: 'bio', website: 'website', twitter: 'twitter', linkedin: 'linkedin' },
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/sanitize', () => ({ sanitizeHtml: vi.fn((s: string) => s) }));

import { updateUserProfile } from '@/actions/blog/profile';

const update = updateUserProfile as unknown as { handler: (...a: any[]) => Promise<any> };

function userCtx() {
  return {
    locals: { user: { id: 'user-1', role: 'user', email: 'u@test.com' } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

const mockSet = vi.fn();
const mockWhere = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockReturnValue({ where: mockWhere.mockResolvedValue([]) });
  mockUpdate.mockReturnValue({ set: mockSet });
});

describe('blog user profile', () => {
  it('updates the current user profile with normalized social handles', async () => {
    const res = await update.handler(
      {
        bio: 'Hello world',
        website: 'https://example.com',
        twitter: '@myhandle',
        linkedin: 'https://linkedin.com/in/me',
      },
      userCtx(),
    );
    expect(res.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.twitter).toBe('myhandle');
    expect(setArg.linkedin).toBe('me');
    expect(setArg.website).toBe('https://example.com');
  });

  it('throws UNAUTHORIZED when not logged in', async () => {
    const ctx = {
      locals: {},
      request: { headers: new Headers() },
      clientAddress: '127.0.0.1',
    } as any;
    await expect(
      update.handler({ bio: 'x' }, ctx),
    ).rejects.toThrow();
  });

  it('clears fields when empty', async () => {
    const res = await update.handler(
      { bio: '', website: '', twitter: '', linkedin: '' },
      userCtx(),
    );
    expect(res.success).toBe(true);
    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.bio).toBeNull();
    expect(setArg.twitter).toBeNull();
  });
});
