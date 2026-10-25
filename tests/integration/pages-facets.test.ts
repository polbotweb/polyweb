/** Facettes et filtres de la liste admin des pages (core/filters) — base réelle ; lignes isolées par un terme de recherche unique. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { and, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { pages } from '@database/schemas';
import { countPagesAdmin, getPagesAdminFacets, pagesAdminConditions, pagesAdminFiltersFromUrl } from '@database/loaders/pages-admin.loader';

const db = getDrizzle();
const t = `pfac${Date.now().toString(36)}`;
const ids = [0, 1, 2, 3].map((i) => `${t}-${i}`);
const bucket = (b: readonly { value: string; count: number }[] | undefined) => Object.fromEntries((b ?? []).map((x) => [x.value, x.count]));

beforeAll(async () => {
  await db.insert(pages).values([
    { id: ids[0]!, locale: 'fr', slug: `${t}-0`, title: `Page ${t} 0`, template: 'default', isPublished: true, publishedAt: new Date() },
    { id: ids[1]!, locale: 'fr', slug: `${t}-1`, title: `Page ${t} 1`, template: 'legal', isPublished: false },
    { id: ids[2]!, locale: 'en', slug: `${t}-2`, title: `Page ${t} 2`, template: 'default', isPublished: true, publishedAt: new Date() },
    { id: ids[3]!, locale: 'en', slug: `${t}-3`, title: `Page ${t} 3`, template: 'default', isPublished: false },
  ]);
});
afterAll(async () => {
  await db.delete(pages).where(inArray(pages.id, ids));
});

describe('pages admin — filtres et facettes', () => {
  it("parse l'URL canonique et ignore les valeurs hors définition", () => {
    expect(pagesAdminFiltersFromUrl(`q=${t}&status=draft&template=legal&locale=xx`)).toEqual({ q: t, status: 'draft', template: 'legal', locale: undefined });
  });

  it('compte chaque facette sans son propre filtre', async () => {
    const facets = await Effect.runPromise(getPagesAdminFacets({ q: t, status: 'published', locale: 'fr' }));
    expect(bucket(facets.status)).toEqual({ published: 1, draft: 1 }); // langue fr, statut ignoré
    expect(bucket(facets.locale)).toEqual({ fr: 1, en: 1 }); // publiées, langue ignorée
    expect(bucket(facets.template)).toEqual({ default: 1 }); // publiées + fr
  });

  it('filtre la liste et le total', async () => {
    const f = pagesAdminFiltersFromUrl(`q=${t}&status=draft`);
    expect(await Effect.runPromise(countPagesAdmin(f))).toBe(2);
    const rows = await db.select({ id: pages.id }).from(pages).where(and(...pagesAdminConditions({ ...f, template: 'legal' })));
    expect(rows.map((r) => r.id)).toEqual([ids[1]]);
  });
});
