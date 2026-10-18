import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import {
  pages,
  pageSections,
  themeSettings,
  navigationMenus,
  navigationItems,
  socialLinks,
} from '@database/schemas';

/**
 * Integration tests for CMS admin DB operations.
 * These exercise the same Drizzle queries the Astro Actions call.
 */

const db = getDrizzle();
const cleanupIds: { table: string; id: string }[] = [];

afterAll(async () => {
  for (const { table, id } of cleanupIds.reverse()) {
    try {
      if (table === 'pages') await db.delete(pages).where(eq(pages.id, id));
      else if (table === 'page_sections') await db.delete(pageSections).where(eq(pageSections.id, id));
      else if (table === 'theme_settings') await db.delete(themeSettings).where(eq(themeSettings.id, id));
      else if (table === 'navigation_menus') await db.delete(navigationMenus).where(eq(navigationMenus.id, id));
      else if (table === 'navigation_items') await db.delete(navigationItems).where(eq(navigationItems.id, id));
      else if (table === 'social_links') await db.delete(socialLinks).where(eq(socialLinks.id, id));
    } catch { /* already deleted */ }
  }
});

// ─── Pages CRUD ──────────────────────────────────────────────────────

describe('CMS Admin — Pages', () => {
  let pageId: string;

  it('creates a page', async () => {
    const [created] = await db
      .insert(pages)
      .values({
        locale: 'fr',
        slug: `test-page-${Date.now()}`,
        title: 'Page de test',
        isPublished: false,
      })
      .returning();

    expect(created).toBeDefined();
    expect(created.title).toBe('Page de test');
    expect(created.isPublished).toBe(false);
    pageId = created.id;
    cleanupIds.push({ table: 'pages', id: pageId });
  });

  it('updates a page', async () => {
    const [updated] = await db
      .update(pages)
      .set({ title: 'Page modifiée', isPublished: true, publishedAt: new Date() })
      .where(eq(pages.id, pageId))
      .returning();

    expect(updated.title).toBe('Page modifiée');
    expect(updated.isPublished).toBe(true);
    expect(updated.publishedAt).toBeTruthy();
  });

  it('enforces unique locale+slug constraint', async () => {
    const [existing] = await db
      .select({ slug: pages.slug, locale: pages.locale })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);

    // Actually try to insert a duplicate locale+slug — must throw
    await expect(
      db.insert(pages).values({
        locale: existing.locale,
        slug: existing.slug,
        title: 'Duplicate',
      }),
    ).rejects.toThrow();
  });

  it('deletes a page', async () => {
    const [deleted] = await db
      .delete(pages)
      .where(eq(pages.id, pageId))
      .returning({ id: pages.id });

    expect(deleted.id).toBe(pageId);
    cleanupIds.pop(); // already removed
  });
});

// ─── Page Sections CRUD ──────────────────────────────────────────────

describe('CMS Admin — Sections', () => {
  let parentPageId: string;
  let sectionId: string;

  it('creates a parent page then a section', async () => {
    const [page] = await db
      .insert(pages)
      .values({ locale: 'fr', slug: `sect-page-${Date.now()}`, title: 'Section Parent' })
      .returning();
    parentPageId = page.id;
    cleanupIds.push({ table: 'pages', id: parentPageId });

    const [section] = await db
      .insert(pageSections)
      .values({
        pageId: parentPageId,
        type: 'hero',
        content: { heading: 'Hello' },
        sortOrder: 0,
        isVisible: true,
      })
      .returning();

    expect(section.type).toBe('hero');
    expect(section.content).toEqual({ heading: 'Hello' });
    sectionId = section.id;
    cleanupIds.push({ table: 'page_sections', id: sectionId });
  });

  it('updates a section', async () => {
    const [updated] = await db
      .update(pageSections)
      .set({ content: { heading: 'Updated' }, isVisible: false })
      .where(eq(pageSections.id, sectionId))
      .returning();

    expect(updated.isVisible).toBe(false);
    expect(updated.content).toEqual({ heading: 'Updated' });
  });

  it('deletes a section', async () => {
    const [deleted] = await db
      .delete(pageSections)
      .where(eq(pageSections.id, sectionId))
      .returning({ id: pageSections.id });

    expect(deleted.id).toBe(sectionId);
    cleanupIds.splice(cleanupIds.findIndex(e => e.id === sectionId), 1);
  });
});

// ─── Themes CRUD ─────────────────────────────────────────────────────

describe('CMS Admin — Themes', () => {
  let themeId: string;

  it('creates a theme', async () => {
    const [created] = await db
      .insert(themeSettings)
      .values({ name: `Test Theme ${Date.now()}`, isActive: false })
      .returning();

    expect(created.name).toContain('Test Theme');
    expect(created.isActive).toBe(false);
    themeId = created.id;
    cleanupIds.push({ table: 'theme_settings', id: themeId });
  });

  it('updates a theme with colors', async () => {
    const [updated] = await db
      .update(themeSettings)
      .set({
        primaryColor: 'oklch(0.65 0.15 250)',
        fontHeading: 'Inter',
      })
      .where(eq(themeSettings.id, themeId))
      .returning();

    expect(updated.primaryColor).toBe('oklch(0.65 0.15 250)');
    expect(updated.fontHeading).toBe('Inter');
  });

  it('activating a theme deactivates others', async () => {
    // Deactivate all first
    await db.update(themeSettings).set({ isActive: false });
    // Activate our test theme
    await db
      .update(themeSettings)
      .set({ isActive: true })
      .where(eq(themeSettings.id, themeId));

    const [active] = await db
      .select()
      .from(themeSettings)
      .where(eq(themeSettings.isActive, true))
      .limit(1);

    expect(active.id).toBe(themeId);

    // Restore: deactivate test theme
    await db.update(themeSettings).set({ isActive: false }).where(eq(themeSettings.id, themeId));
  });

  it('deletes a theme', async () => {
    await db.delete(themeSettings).where(eq(themeSettings.id, themeId));

    const [remaining] = await db
      .select({ id: themeSettings.id })
      .from(themeSettings)
      .where(eq(themeSettings.id, themeId))
      .limit(1);

    expect(remaining).toBeUndefined();
    cleanupIds.splice(cleanupIds.findIndex(e => e.id === themeId), 1);
  });
});

// ─── Social Links CRUD ───────────────────────────────────────────────

describe('CMS Admin — Social Links', () => {
  let linkId: string;

  it('creates a social link', async () => {
    const [created] = await db
      .insert(socialLinks)
      .values({
        platform: 'github',
        url: 'https://github.com/test',
        isActive: true,
        sortOrder: 99,
      })
      .returning();

    expect(created.platform).toBe('github');
    linkId = created.id;
    cleanupIds.push({ table: 'social_links', id: linkId });
  });

  it('updates a social link', async () => {
    const [updated] = await db
      .update(socialLinks)
      .set({ url: 'https://github.com/updated', label: 'GitHub' })
      .where(eq(socialLinks.id, linkId))
      .returning();

    expect(updated.url).toBe('https://github.com/updated');
    expect(updated.label).toBe('GitHub');
  });

  it('deletes a social link', async () => {
    const [deleted] = await db
      .delete(socialLinks)
      .where(eq(socialLinks.id, linkId))
      .returning({ id: socialLinks.id });

    expect(deleted.id).toBe(linkId);
    cleanupIds.splice(cleanupIds.findIndex(e => e.id === linkId), 1);
  });
});
