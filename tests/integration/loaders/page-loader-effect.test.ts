/**
 * page.loader — lectures Effect-natives contre un vrai Postgres : page publiée + sections
 * visibles, publication programmée échue persistée (lazy-update), brouillon invisible
 * publiquement mais visible en aperçu avec toutes ses sections, liste publiée.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { pages, pageSections } from '@database/schemas';
import * as pageLoader from '@database/loaders/page.loader';

const t = `pgeff-${crypto.randomUUID().slice(0, 8)}`;
const published = crypto.randomUUID();
const scheduled = crypto.randomUUID();
const draft = crypto.randomUUID();
const fx = pageLoader.pageLoaderEffects;

beforeAll(async () => {
  const db = getDrizzle();
  await db.insert(pages).values([
    { id: published, locale: 'fr', slug: `${t}-pub`, title: 'Publiée', isPublished: true, publishedAt: new Date(Date.now() - 60_000) },
    { id: scheduled, locale: 'fr', slug: `${t}-sched`, title: 'Programmée', isPublished: false, scheduledAt: new Date(Date.now() - 60_000) },
    { id: draft, locale: 'fr', slug: `${t}-draft`, title: 'Brouillon', isPublished: false },
  ] as never);
  await db.insert(pageSections).values([
    { pageId: published, type: 'hero', content: { n: 1 }, sortOrder: 1, isVisible: true },
    { pageId: published, type: 'text', content: { n: 0 }, sortOrder: 0, isVisible: true },
    { pageId: published, type: 'cta', content: { n: 2 }, sortOrder: 2, isVisible: false },
  ]);
});

afterAll(async () => {
  await getDrizzle().delete(pages).where(inArray(pages.id, [published, scheduled, draft]));
});

describe('page.loader Effect-natif', () => {
  it('page publiée : sections visibles triées ; Promise = Effect', async () => {
    const res = await Effect.runPromise(fx.getPage('fr', `${t}-pub`));
    expect(res?.page.id).toBe(published);
    expect(res?.sections.map((s) => s.type)).toEqual(['text', 'hero']);
    expect(await pageLoader.getPage('fr', `${t}-pub`)).toEqual(res);
  });

  it('publication programmée échue : servie et persistée comme publiée', async () => {
    const res = await Effect.runPromise(fx.getPage('fr', `${t}-sched`));
    expect(res?.page.id).toBe(scheduled);
    const [row] = await getDrizzle().select().from(pages).where(eq(pages.id, scheduled));
    expect(row).toMatchObject({ isPublished: true, scheduledAt: null });
    expect(row.publishedAt).not.toBeNull();
  });

  it('brouillon / locale invalide : null publiquement ; aperçu admin avec toutes les sections', async () => {
    expect(await Effect.runPromise(fx.getPage('fr', `${t}-draft`))).toBeNull();
    expect(await Effect.runPromise(fx.getPage('xx', `${t}-pub`))).toBeNull();
    expect((await Effect.runPromise(fx.getPagePreview(draft)))?.page.id).toBe(draft);
    expect((await pageLoader.getPagePreview(published))?.sections.map((s) => s.type)).toEqual(['text', 'hero', 'cta']);
    expect(await pageLoader.getPagePreview(crypto.randomUUID())).toBeNull();
  });

  it('liste publiée de la locale, sans brouillon', async () => {
    const ids = (await Effect.runPromise(fx.getPagesList('fr'))).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([published, scheduled]));
    expect(ids).not.toContain(draft);
    expect(await Effect.runPromise(fx.getPagesList('xx'))).toEqual([]);
  });
});
