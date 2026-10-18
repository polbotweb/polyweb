import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── DB Mock ─────────────────────────────────────────────────────────
const mockDb = {
  select: vi.fn(),
};

vi.mock('@database/drizzle', () => ({
  getDrizzle: vi.fn(() => mockDb),
}));

vi.mock('@database/schemas', () => ({
  siteSettings: { id: 'id', locale: 'locale' },
  socialLinks: { sortOrder: 'sortOrder', isActive: 'isActive' },
  contactInfo: {},
  openingHours: { dayOfWeek: 'dayOfWeek' },
  themeSettings: { name: 'name', isActive: 'isActive' },
}));

// Bypass cache — invoke the key function for coverage, then call the inner fn
vi.mock('@database/cache', () => ({
  cached: (keyFn: any, fn: any) =>
    (...args: any[]) => { keyFn(...args); return fn(...args); },
}));

vi.mock('@i18n/utils', () => ({
  isValidLocale: vi.fn((l: string) => ['fr', 'en', 'es', 'ar'].includes(l)),
}));

vi.mock('@/lib/theme-tokens', () => ({
  parseTokenMap: vi.fn((v: any) => v),
  generateThemeCss: vi.fn(() => ':root { --primary: red; }'),
  DEFAULT_LIGHT_TOKENS: { primary: '0.5 0.2 250' },
  DEFAULT_DARK_TOKENS: { primary: '0.3 0.2 250' },
}));

import {
  getSiteSettings,
  getSocialLinks,
  getContactInfo,
  getOpeningHours,
  getActiveTheme,
  getAllThemes,
  getActiveThemeCss,
} from '@/database/loaders/site.loader';
import { parseTokenMap } from '@/lib/theme-tokens';

// ── Helpers ─────────────────────────────────────────────────────────

function selectChain(rows: any[]) {
  const terminal: any = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnValue(Object.assign(Promise.resolve(rows), { limit: vi.fn().mockResolvedValue(rows) })),
  });
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(terminal),
      orderBy: vi.fn().mockReturnValue(terminal),
      limit: vi.fn().mockResolvedValue(rows),
    }),
  };
}

beforeEach(() => {
  mockDb.select.mockReset();
});

// ─── getSiteSettings ────────────────────────────────────────────────

describe('getSiteSettings', () => {
  it('returns settings for a valid locale', async () => {
    const row = { id: 's1', locale: 'fr', siteName: 'Test' };
    mockDb.select.mockReturnValueOnce(selectChain([row]));

    const result = await getSiteSettings('fr');
    expect(result).toEqual(row);
  });

  it('returns null for invalid locale', async () => {
    const result = await getSiteSettings('xx');
    expect(result).toBeNull();
  });

  it('returns null when no row exists', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    const result = await getSiteSettings('en');
    expect(result).toBeNull();
  });
});

// ─── getSocialLinks ─────────────────────────────────────────────────

describe('getSocialLinks', () => {
  it('returns active social links', async () => {
    const rows = [{ id: '1', platform: 'github', url: 'https://github.com' }];
    mockDb.select.mockReturnValueOnce(selectChain(rows));

    const result = await getSocialLinks();
    expect(result).toHaveLength(1);
  });
});

// ─── getContactInfo ─────────────────────────────────────────────────

describe('getContactInfo', () => {
  it('returns contact info', async () => {
    const row = { id: 'c1', email: 'a@b.com' };
    mockDb.select.mockReturnValueOnce(selectChain([row]));

    const result = await getContactInfo();
    expect(result).toEqual(row);
  });

  it('returns null when no contact exists', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    const result = await getContactInfo();
    expect(result).toBeNull();
  });
});

// ─── getOpeningHours ────────────────────────────────────────────────

describe('getOpeningHours', () => {
  it('returns hours sorted by day', async () => {
    const rows = [{ dayOfWeek: 0 }, { dayOfWeek: 1 }];
    mockDb.select.mockReturnValueOnce(selectChain(rows));

    const result = await getOpeningHours();
    expect(result).toHaveLength(2);
  });
});

// ─── getActiveTheme ─────────────────────────────────────────────────

describe('getActiveTheme', () => {
  it('returns the active theme', async () => {
    const theme = { id: 't1', name: 'Default', isActive: true };
    mockDb.select.mockReturnValueOnce(selectChain([theme]));

    const result = await getActiveTheme();
    expect(result).toEqual(theme);
  });

  it('returns null when no active theme', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    const result = await getActiveTheme();
    expect(result).toBeNull();
  });
});

// ─── getAllThemes ────────────────────────────────────────────────────

describe('getAllThemes', () => {
  it('returns all themes', async () => {
    const rows = [{ id: 't1' }, { id: 't2' }];
    mockDb.select.mockReturnValueOnce(selectChain(rows));

    const result = await getAllThemes();
    expect(result).toHaveLength(2);
  });
});

// ─── getActiveThemeCss ──────────────────────────────────────────────

describe('getActiveThemeCss', () => {
  it('returns CSS for active theme', async () => {
    const theme = {
      id: 't1', isActive: true,
      lightTokens: { primary: '0.5 0.2 250' },
      darkTokens: { primary: '0.3 0.2 250' },
      borderRadius: '0.5rem',
    };
    mockDb.select.mockReturnValueOnce(selectChain([theme]));

    const result = await getActiveThemeCss();
    expect(result).toContain(':root');
  });

  it('returns empty string when no active theme', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const result = await getActiveThemeCss();
    expect(result).toBe('');
  });

  it('falls back to buildLegacyTokenMap when parseTokenMap returns null', async () => {
    const theme = {
      id: 't2', isActive: true,
      lightTokens: null,
      darkTokens: null,
      borderRadius: '0.25rem',
      primaryColor: '#ff0000',
      secondaryColor: '#00ff00',
      accentColor: '#0000ff',
      backgroundColor: '#ffffff',
      foregroundColor: '#000000',
      mutedColor: '#cccccc',
      mutedForegroundColor: '#666666',
    };
    mockDb.select.mockReturnValueOnce(selectChain([theme]));
    vi.mocked(parseTokenMap).mockReturnValue(null as any);

    const result = await getActiveThemeCss();
    expect(result).toContain(':root');

    // Restore default mock behaviour
    vi.mocked(parseTokenMap).mockImplementation((v: any) => v);
  });
});
