import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────
const mockSelect = vi.fn();

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => ({ select: mockSelect })),
}));

vi.mock('@database/schemas', () => ({
  navigationMenus: { id: 'id', name: 'name', isVisible: 'isVisible' },
  navigationItems: {
    id: 'id',
    menuId: 'menuId',
    locale: 'locale',
    isActive: 'isActive',
    parentId: 'parentId',
    sortOrder: 'sortOrder',
  },
}));

// Bypass the cache wrapper — call the underlying function directly
vi.mock('@database/cache', () => ({
  cached: (_keyFn: any, fn: any) => fn,
  invalidateCache: vi.fn(),
}));

vi.mock('@i18n/utils', () => ({
  isValidLocale: vi.fn((l: string) => ['fr', 'en', 'es', 'ar'].includes(l)),
}));

// ── Imports ─────────────────────────────────────────────────────────
import { getMenu, getMenusList, getMenuMeta } from '@/database/loaders/navigation.loader';

function fluent(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnValue(Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
    })),
    where: vi.fn().mockReturnValue(Object.assign(Promise.resolve(rows), {
      limit: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockReturnValue(Object.assign(Promise.resolve(rows), {
        limit: vi.fn().mockResolvedValue(rows),
      })),
    })),
  });
  return {
    from: vi.fn().mockReturnValue(terminal),
  };
}
function selectChain(rows: any[]) { return fluent(rows); }

beforeEach(() => mockSelect.mockReset());

// ─── getMenu ────────────────────────────────────────────────────────

describe('getMenu', () => {
  it('returns empty for invalid locale', async () => {
    const result = await getMenu('header', 'xx');
    expect(result).toEqual([]);
  });

  it('returns empty when menu not found', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    const result = await getMenu('unknown', 'fr');
    expect(result).toEqual([]);
  });

  it('returns empty when menu is hidden', async () => {
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'm1', name: 'header', isVisible: false }]));

    const result = await getMenu('header', 'fr');
    expect(result).toEqual([]);
  });

  it('returns a tree of items for a visible menu', async () => {
    // Menu query
    mockSelect.mockReturnValueOnce(selectChain([{ id: 'm1', name: 'header', isVisible: true }]));
    // Items query
    mockSelect.mockReturnValueOnce(selectChain([
      { id: 'i1', parentId: null, label: 'Home', url: '/', icon: null, showIcon: false, openInNewTab: false },
      { id: 'i2', parentId: 'i1', label: 'Sub', url: '/sub', icon: null, showIcon: false, openInNewTab: false },
    ]));

    const result = await getMenu('header', 'fr');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Home');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].label).toBe('Sub');
  });
});

// ─── getMenusList ───────────────────────────────────────────────────

describe('getMenusList', () => {
  it('returns all menus', async () => {
    const menus = [
      { id: 'm1', name: 'header', description: null, isVisible: true, displayLabel: null, showHeading: false },
      { id: 'm2', name: 'footer', description: null, isVisible: true, displayLabel: null, showHeading: false },
    ];
    mockSelect.mockReturnValueOnce(selectChain(menus));

    const result = await getMenusList();
    expect(result).toEqual(menus);
  });
});

// ─── getMenuMeta ────────────────────────────────────────────────────

describe('getMenuMeta', () => {
  it('returns menu metadata', async () => {
    const menu = { id: 'm1', name: 'header', description: null, isVisible: true, displayLabel: 'Nav', showHeading: true };
    mockSelect.mockReturnValueOnce(selectChain([menu]));

    const result = await getMenuMeta('header');
    expect(result).toEqual(menu);
  });

  it('returns null when menu not found', async () => {
    mockSelect.mockReturnValueOnce(selectChain([]));

    const result = await getMenuMeta('unknown');
    expect(result).toBeNull();
  });
});
