import { describe, it, expect } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { pages, pageSections } from '@database/schemas';
import { getPage } from '@database/loaders/page.loader';
import { LOCALES } from '@i18n/config';

/**
 * Integration tests for CMS-driven legal pages.
 * Verifies seed data is present and the page loader returns correct structures.
 */

const db = getDrizzle();

const expectedSlugs: Record<string, string> = {
  fr: 'mentions-legales',
  en: 'legal-notice',
  es: 'aviso-legal',
  ar: '\u0627\u0644\u0634\u0631\u0648\u0637-\u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a\u0629',
};

// ─── Seed data presence ──────────────────────────────────────────────

describe('Legal CMS — Seed data', () => {
  it('has exactly 4 legal pages (one per locale)', async () => {
    const rows = await db
      .select({ id: pages.id, locale: pages.locale, slug: pages.slug })
      .from(pages)
      .where(eq(pages.template, 'legal'));

    expect(rows).toHaveLength(4);
    const locales = rows.map((r) => r.locale).sort();
    expect(locales).toEqual([...LOCALES].sort());
  });

  it.each([...LOCALES])('locale %s has 3 FAQ sections', async (locale) => {
    const [page] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.template, 'legal'), eq(pages.locale, locale)))
      .limit(1);

    expect(page).toBeDefined();

    const sections = await db
      .select()
      .from(pageSections)
      .where(eq(pageSections.pageId, page.id));

    expect(sections).toHaveLength(3);
    sections.forEach((s) => {
      expect(s.type).toBe('faq');
      expect(s.isVisible).toBe(true);
    });
  });

  it.each([...LOCALES])('locale %s section content is valid JSON with items', async (locale) => {
    const [page] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.template, 'legal'), eq(pages.locale, locale)))
      .limit(1);

    const sections = await db
      .select({ content: pageSections.content })
      .from(pageSections)
      .where(eq(pageSections.pageId, page.id));

    for (const s of sections) {
      const parsed = typeof s.content === 'string' ? JSON.parse(s.content) : s.content as Record<string, unknown>;
      expect(parsed.title).toBeTypeOf('string');
      expect(parsed.items).toBeInstanceOf(Array);
      expect((parsed.items as unknown[]).length).toBeGreaterThan(0);
      (parsed.items as { question: string; answer: string }[]).forEach((item) => {
        expect(item.question).toBeTypeOf('string');
        expect(item.answer).toBeTypeOf('string');
      });
    }
  });
});

// ─── Page loader ─────────────────────────────────────────────────────

describe('Legal CMS — getPage loader', () => {
  it.each([...LOCALES])('loads published legal page for %s', async (locale) => {
    const slug = expectedSlugs[locale];
    const result = await getPage(locale, slug);

    expect(result).not.toBeNull();
    expect(result!.page.locale).toBe(locale);
    expect(result!.page.slug).toBe(slug);
    expect(result!.page.template).toBe('legal');
    expect(result!.page.isPublished).toBe(true);
  });

  it.each([...LOCALES])('returns 3 visible sections for %s', async (locale) => {
    const slug = expectedSlugs[locale];
    const result = await getPage(locale, slug);

    expect(result).not.toBeNull();
    expect(result!.sections).toHaveLength(3);

    // Verify sort order
    const orders = result!.sections.map((s) => s.sortOrder);
    expect(orders).toEqual([0, 1, 2]);
  });

  it('returns null for non-existent slug', async () => {
    const result = await getPage('fr', 'page-qui-nexiste-pas');
    expect(result).toBeNull();
  });

  it('returns null for invalid locale', async () => {
    const result = await getPage('zz', 'mentions-legales');
    expect(result).toBeNull();
  });
});
