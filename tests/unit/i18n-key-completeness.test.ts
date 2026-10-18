import { describe, it, expect } from 'vitest';
import { LOCALES } from '@/i18n/config';
import type { CommonTranslations } from '@/i18n/config';
import type { BlogTranslations } from '@/i18n/config';

/**
 * Cross-locale key completeness tests (P3.13).
 * Ensures every locale's common.ts / blog.ts has the same keys as every other locale.
 */

async function loadCommon(locale: string): Promise<CommonTranslations> {
  const mod = await import(`@/i18n/${locale}/common`);
  return mod.default;
}

async function loadBlog(locale: string): Promise<BlogTranslations> {
  const mod = await import(`@/i18n/blog/${locale}`);
  return mod.default;
}

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flatKeys(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe('i18n cross-locale key completeness', () => {
  it('all locales define the same common translation keys', async () => {
    const allKeys: Record<string, string[]> = {};
    for (const locale of LOCALES) {
      const translations = await loadCommon(locale);
      allKeys[locale] = flatKeys(translations as unknown as Record<string, unknown>);
    }

    const reference = allKeys[LOCALES[0]];
    for (const locale of LOCALES.slice(1)) {
      const missing = reference.filter((k) => !allKeys[locale].includes(k));
      const extra = allKeys[locale].filter((k) => !reference.includes(k));

      expect(missing, `${locale} is missing keys vs ${LOCALES[0]}: ${missing.join(', ')}`).toEqual([]);
      expect(extra, `${locale} has extra keys vs ${LOCALES[0]}: ${extra.join(', ')}`).toEqual([]);
    }
  });

  it('no locale has empty string values in common translations', async () => {
    for (const locale of LOCALES) {
      const translations = await loadCommon(locale);
      const keys = flatKeys(translations as unknown as Record<string, unknown>);
      for (const key of keys) {
        const value = key.split('.').reduce<unknown>((obj, k) => {
          if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
          return undefined;
        }, translations as unknown);

        if (typeof value === 'string') {
          expect(value.trim().length, `${locale}.${key} is empty`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('all LOCALES entries are lowercase 2-letter codes', () => {
    for (const locale of LOCALES) {
      expect(locale).toMatch(/^[a-z]{2}$/);
    }
  });

  it('default locale (fr) is first in LOCALES array', () => {
    expect(LOCALES[0]).toBe('fr');
  });

  it('RTL locales are a subset of LOCALES', async () => {
    const { RTL_LOCALES } = await import('@/i18n/config');
    for (const rtl of RTL_LOCALES) {
      expect(LOCALES).toContain(rtl);
    }
  });

  it('all locales define the same blog translation keys', async () => {
    const allKeys: Record<string, string[]> = {};
    for (const locale of LOCALES) {
      const translations = await loadBlog(locale);
      allKeys[locale] = flatKeys(translations as unknown as Record<string, unknown>);
    }

    const reference = allKeys[LOCALES[0]];
    for (const locale of LOCALES.slice(1)) {
      const missing = reference.filter((k) => !allKeys[locale].includes(k));
      const extra = allKeys[locale].filter((k) => !reference.includes(k));

      expect(missing, `${locale} is missing blog keys vs ${LOCALES[0]}: ${missing.join(', ')}`).toEqual([]);
      expect(extra, `${locale} has extra blog keys vs ${LOCALES[0]}: ${extra.join(', ')}`).toEqual([]);
    }
  });

  it('no locale has empty string values in blog translations', async () => {
    for (const locale of LOCALES) {
      const translations = await loadBlog(locale);
      const keys = flatKeys(translations as unknown as Record<string, unknown>);
      for (const key of keys) {
        const value = key.split('.').reduce<unknown>((obj, k) => {
          if (obj && typeof obj === 'object') return (obj as Record<string, unknown>)[k];
          return undefined;
        }, translations as unknown);

        if (typeof value === 'string') {
          expect(value.trim().length, `${locale}.${key} is empty`).toBeGreaterThan(0);
        }
      }
    }
  });
});
