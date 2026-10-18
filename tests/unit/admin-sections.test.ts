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
  pageSections: { id: 'id', pageId: 'pageId', type: 'type', updatedAt: 'updatedAt' },
  pages: { id: 'id' },
}));

vi.mock('@database/cache', () => ({ invalidateCache: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
  extractIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock('@/lib/sanitize', () => ({
  sanitizeHtml: vi.fn((v: string) => v),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { userHasPermission: vi.fn(() => Promise.resolve({ success: true })) } },
}));

// ── Imports ─────────────────────────────────────────────────────────
import {
  sanitizeSectionContent,
  createSection as _create,
  updateSection as _update,
  deleteSection as _del,
  reorderSections as _reorder,
} from '@/actions/admin/sections';

const createSection = _create as unknown as { handler: (...a: any[]) => Promise<any> };
const updateSection = _update as unknown as { handler: (...a: any[]) => Promise<any> };
const deleteSection = _del as unknown as { handler: (...a: any[]) => Promise<any> };
const reorderSections = _reorder as unknown as { handler: (...a: any[]) => Promise<any> };

function adminCtx() {
  return {
    locals: { user: { id: 'admin-1', role: 'admin', email: 'a@test.com' } },
    request: { headers: new Headers() },
    clientAddress: '127.0.0.1',
  } as any;
}

/** Returns a real Promise decorated with .from/.where/.limit/.orderBy so both
 *  `await db.select().from().where()` and `db.select().from().where().limit()` work. */
function selectChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnValue(Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
    })),
  });
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminal),
      orderBy: vi.fn().mockReturnValue(terminal),
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

// ─── sanitizeSectionContent (pure export) ───────────────────────────

describe('sanitizeSectionContent', () => {
  it('sanitizes string values in JSON', () => {
    const input = JSON.stringify({ title: 'Hello', nested: { text: 'World' } });
    const result = sanitizeSectionContent(input) as Record<string, any>;
    expect(result.title).toBe('Hello');
    expect(result.nested.text).toBe('World');
  });

  it('handles arrays', () => {
    const input = JSON.stringify(['a', 'b']);
    const result = sanitizeSectionContent(input);
    expect(result).toEqual(['a', 'b']);
  });

  it('preserves numbers, booleans, null', () => {
    const input = JSON.stringify({ n: 42, b: true, x: null });
    const result = sanitizeSectionContent(input);
    expect(result).toEqual({ n: 42, b: true, x: null });
  });

  it('throws on invalid JSON', () => {
    expect(() => sanitizeSectionContent('not json')).toThrow('JSON valide');
  });
});

// ─── createSection ──────────────────────────────────────────────────

describe('createSection', () => {
  it('creates a section when page exists', async () => {
    const created = { id: 's1', pageId: 'p1', type: 'hero', content: '{}' };
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'p1' }]));
    mockInsert.mockReturnValue(insertChain([created]));

    const result = await createSection.handler(
      { pageId: 'p1', type: 'hero', content: '{}' },
      adminCtx(),
    );
    expect(result).toEqual(created);
  });

  it('throws when page does not exist', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      createSection.handler({ pageId: 'nope', type: 'hero', content: '{}' }, adminCtx()),
    ).rejects.toThrow("n'existe pas");
  });

  it('throws UNAUTHORIZED with no user', async () => {
    const ctx = { locals: { user: null }, request: { headers: new Headers() } } as any;
    await expect(
      createSection.handler({ pageId: 'p1', type: 'hero', content: '{}' }, ctx),
    ).rejects.toThrow('connecté');
  });
});

// ─── updateSection ──────────────────────────────────────────────────

describe('updateSection', () => {
  it('updates a section', async () => {
    const updated = { id: 's1', type: 'text' };
    mockUpdate.mockReturnValue(updateChain([updated]));

    const result = await updateSection.handler(
      { id: 's1', type: 'text' },
      adminCtx(),
    );
    expect(result).toEqual(updated);
  });

  it('throws NOT_FOUND when section missing', async () => {
    mockUpdate.mockReturnValue(updateChain([]));
    mockSelect.mockReturnValueOnce(selectChain([]));

    await expect(
      updateSection.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });

  it('throws CONFLICT when optimistic lock fails but section exists', async () => {
    mockUpdate.mockReturnValue(updateChain([]));
    mockSelect.mockReturnValueOnce(selectChain([{ id: 's1' }]));

    await expect(
      updateSection.handler(
        { id: 's1', expectedUpdatedAt: '2024-01-01T00:00:00Z' },
        adminCtx(),
      ),
    ).rejects.toThrow('modifiée par un autre');
  });

  it('validates content structure against section type on update', async () => {
    // Provide content with invalid structure for a hero section:
    // hero allows `title` (string), not a number.
    // First select call: fetch current section type (hero)
    mockSelect.mockReturnValueOnce(selectChain([{ type: 'hero' }]));
    // The update should fail because validateStructure rejects non-string title
    await expect(
      updateSection.handler(
        { id: 's1', content: JSON.stringify({ title: 12345 }) },
        adminCtx(),
      ),
    ).rejects.toThrow('invalide');
  });
});

// ─── deleteSection ──────────────────────────────────────────────────

describe('deleteSection', () => {
  it('deletes a section', async () => {
    mockDelete.mockReturnValue(deleteChain([{ id: 's1', type: 'hero' }]));

    const result = await deleteSection.handler({ id: 's1' }, adminCtx());
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when section missing', async () => {
    mockDelete.mockReturnValue(deleteChain([]));

    await expect(
      deleteSection.handler({ id: 'nope' }, adminCtx()),
    ).rejects.toThrow('introuvable');
  });
});

// ─── reorderSections ────────────────────────────────────────────────

describe('reorderSections', () => {
  it('reorders sections belonging to the same page', async () => {
    mockSelect.mockReturnValueOnce(selectChain([
      { id: 's1', pageId: 'p1' },
      { id: 's2', pageId: 'p1' },
    ]));
    mockUpdate.mockReturnValue(updateChain([]));

    const result = await reorderSections.handler(
      { items: [{ id: 's1', sortOrder: 0 }, { id: 's2', sortOrder: 1 }] },
      adminCtx(),
    );
    expect(result).toEqual({ success: true });
  });

  it('throws NOT_FOUND when some sections missing', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ id: 's1', pageId: 'p1' }]));

    await expect(
      reorderSections.handler(
        { items: [{ id: 's1', sortOrder: 0 }, { id: 's2', sortOrder: 1 }] },
        adminCtx(),
      ),
    ).rejects.toThrow('introuvables');
  });

  it('throws when sections belong to different pages', async () => {
    mockSelect.mockReturnValueOnce(selectChain([
      { id: 's1', pageId: 'p1' },
      { id: 's2', pageId: 'p2' },
    ]));

    await expect(
      reorderSections.handler(
        { items: [{ id: 's1', sortOrder: 0 }, { id: 's2', sortOrder: 1 }] },
        adminCtx(),
      ),
    ).rejects.toThrow('même page');
  });
});
