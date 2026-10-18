import { describe, it, expect } from 'vitest';

// ─── Seed data completeness tests ───────────────────────────────────
// Verify that every seed file provides all required (non-auto) fields for its schema.

describe('Seed — site settings', () => {
  it('provides all fields for every locale', async () => {
    const { default: data } = await import('@database/data/03-site-settings.data');
    expect(data.length).toBeGreaterThanOrEqual(4);

    const requiredKeys = [
      'locale', 'siteName', 'siteDescription', 'siteSlogan',
      'metaTitle', 'metaDescription', 'logoLight', 'logoDark',
      'favicon', 'ogImage',
    ];

    for (const row of data) {
      for (const key of requiredKeys) {
        expect(row, `Missing "${key}" in locale "${row.locale}"`).toHaveProperty(key);
      }
    }
  });

  it('covers fr, en, es, ar locales', async () => {
    const { default: data } = await import('@database/data/03-site-settings.data');
    const locales = data.map((r: any) => r.locale);
    expect(locales).toContain('fr');
    expect(locales).toContain('en');
    expect(locales).toContain('es');
    expect(locales).toContain('ar');
  });
});

describe('Seed — social links', () => {
  it('has at least one entry with all fields', async () => {
    const { default: data } = await import('@database/data/04-social-links.data');
    expect(data.length).toBeGreaterThan(0);

    const requiredKeys = ['platform', 'url', 'icon', 'label', 'sortOrder', 'isActive'];
    for (const row of data) {
      for (const key of requiredKeys) {
        expect(row, `Missing "${key}" in social link "${row.platform}"`).toHaveProperty(key);
      }
    }
  });
});

describe('Seed — contact info', () => {
  it('provides all fields including geo', async () => {
    const { default: data } = await import('@database/data/05-contact-info.data');
    expect(data.length).toBe(1);

    const requiredKeys = [
      'email', 'phone', 'address', 'city', 'postalCode',
      'country', 'mapUrl', 'latitude', 'longitude',
    ];

    for (const key of requiredKeys) {
      expect(data[0], `Missing "${key}"`).toHaveProperty(key);
    }
  });
});

describe('Seed — opening hours', () => {
  it('has 7 rows (Mon-Sun)', async () => {
    const { default: data } = await import('@database/data/06-opening-hours.data');
    expect(data.length).toBe(7);
  });

  it('every row has midday break fields', async () => {
    const { default: data } = await import('@database/data/06-opening-hours.data');
    const requiredKeys = [
      'dayOfWeek', 'isClosed', 'hasMiddayBreak',
      'morningOpen', 'morningClose', 'afternoonOpen', 'afternoonClose',
    ];

    for (const row of data) {
      for (const key of requiredKeys) {
        expect(row, `Day ${row.dayOfWeek} missing "${key}"`).toHaveProperty(key);
      }
    }
  });

  it('day with midday break has split times', async () => {
    const { default: data } = await import('@database/data/06-opening-hours.data');
    const middayDay = data.find((r: any) => r.hasMiddayBreak);
    expect(middayDay).toBeDefined();
    expect(middayDay!.morningOpen).toBeTruthy();
    expect(middayDay!.morningClose).toBeTruthy();
    expect(middayDay!.afternoonOpen).toBeTruthy();
    expect(middayDay!.afternoonClose).toBeTruthy();
  });
});

describe('Seed — navigation menus', () => {
  it('has 4 menus', async () => {
    const { default: data } = await import('@database/data/07-navigation.data');
    expect(data.length).toBe(4);
    const names = data.map((r: any) => r.name);
    expect(names).toContain('header');
    expect(names).toContain('footer_primary');
    expect(names).toContain('footer_secondary');
    expect(names).toContain('footer_legal');
  });
});

describe('Seed — navigation items', () => {
  it('every item has all fields', async () => {
    const { default: data } = await import('@database/data/07b-navigation-items.data');
    expect(data.length).toBeGreaterThan(0);

    const requiredKeys = [
      'menuId', 'locale', 'label', 'url', 'sortOrder',
      'icon', 'parentId', 'isActive', 'openInNewTab',
    ];

    for (const row of data) {
      for (const key of requiredKeys) {
        expect(row, `Missing "${key}" in item "${row.label}"`).toHaveProperty(key);
      }
    }
  });

  it('covers all 4 locales', async () => {
    const { default: data } = await import('@database/data/07b-navigation-items.data');
    const locales = [...new Set(data.map((r: any) => r.locale))];
    expect(locales).toContain('fr');
    expect(locales).toContain('en');
    expect(locales).toContain('es');
    expect(locales).toContain('ar');
  });
  it('includes public Blog and Services routes in every header locale', async () => {
    const { default: data } = await import('@database/data/07b-navigation-items.data');
    const headerItems = data.filter((item: any) => item.menuId === 'menu-header');

    for (const locale of ['fr', 'en', 'es', 'ar']) {
      expect(headerItems).toEqual(expect.arrayContaining([
        expect.objectContaining({ locale, url: `/${locale}/blog`, isActive: true }),
        expect.objectContaining({ locale, url: `/${locale}/services`, isActive: true }),
      ]));
    }
  });
});

describe('Seed — theme', () => {
  it('has default active theme with all fields', async () => {
    const { default: data } = await import('@database/data/08-theme.data');
    expect(data.length).toBeGreaterThan(0);

    const theme = data[0];
    expect(theme.name).toBe('default');
    expect(theme.isActive).toBe(true);

    const requiredKeys = [
      'name', 'isActive', 'primaryColor', 'secondaryColor', 'accentColor',
      'backgroundColor', 'foregroundColor', 'mutedColor', 'mutedForegroundColor',
      'fontHeading', 'fontBody', 'borderRadius',
    ];

    for (const key of requiredKeys) {
      expect(theme, `Missing "${key}"`).toHaveProperty(key);
    }
  });
});
