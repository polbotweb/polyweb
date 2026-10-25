/** Facettes de la liste admin du blog (core/filters) — base réelle, tenant, langue d'affichage et exclusion de sa propre facette. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { blogPosts, blogPostTranslations, organization, user } from '@database/schemas';
import { getBlogAdminFacets } from '@database/loaders/blog-admin.loader';

const db = getDrizzle();
const t = `bfac-${Date.now().toString(36)}`;
const owner = `${t}-u`;
const orgId = `${t}-org`;
const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

beforeAll(async () => {
  await db.insert(user).values({ id: owner, name: 'Facets', email: `${owner}@test.local` });
  await db.insert(organization).values({ id: orgId, name: 'Facets org', slug: orgId, createdAt: new Date() });
  await db.insert(blogPosts).values([
    { id: ids[0]!, organizationId: orgId, authorId: owner, slug: `${t}-0`, status: 'DRAFT', isFeatured: true, isSticky: false },
    { id: ids[1]!, organizationId: orgId, authorId: owner, slug: `${t}-1`, status: 'PUBLISHED', publishedAt: new Date(), isFeatured: true, isSticky: true },
    { id: ids[2]!, organizationId: orgId, authorId: owner, slug: `${t}-2`, status: 'PUBLISHED', publishedAt: new Date(), isFeatured: false, isSticky: false },
    // Traduit uniquement en anglais : invisible dans la liste française, donc hors des comptes 'fr'.
    { id: ids[3]!, organizationId: orgId, authorId: owner, slug: `${t}-3`, status: 'ARCHIVED', isFeatured: false, isSticky: false },
  ]);
  await db.insert(blogPostTranslations).values([
    ...ids.slice(0, 3).map((postId, i) => ({ postId, organizationId: orgId, locale: 'fr' as const, title: `Titre ${i}`, slug: `${t}-fr-${i}`, content: 'x' })),
    { postId: ids[3]!, organizationId: orgId, locale: 'en' as const, title: 'Title 3', slug: `${t}-en-3`, content: 'x' },
  ]);
});
afterAll(async () => {
  await db.delete(blogPosts).where(inArray(blogPosts.id, ids));
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, owner));
});

const asMap = (b: readonly { value: string; count: number }[] | undefined) => Object.fromEntries((b ?? []).map((x) => [x.value, x.count]));

describe('getBlogAdminFacets', () => {
  it('compte dans le tenant et la langue d’affichage uniquement', async () => {
    const f = await Effect.runPromise(getBlogAdminFacets(orgId, 'fr', {}));
    expect(asMap(f.status)).toEqual({ DRAFT: 1, PUBLISHED: 2 });
    expect(asMap(f.featured)).toEqual({ true: 2, false: 1 });
    expect(asMap(f.sticky)).toEqual({ true: 1, false: 2 });
    const en = await Effect.runPromise(getBlogAdminFacets(orgId, 'en', {}));
    expect(asMap(en.status)).toEqual({ ARCHIVED: 1 });
  });
  it('une facette ignore son propre filtre mais applique les autres', async () => {
    const f = await Effect.runPromise(getBlogAdminFacets(orgId, 'fr', { status: 'PUBLISHED', featured: true }));
    expect(asMap(f.status)).toEqual({ DRAFT: 1, PUBLISHED: 1 });
    expect(asMap(f.featured)).toEqual({ true: 1, false: 1 });
    expect(asMap(f.sticky)).toEqual({ true: 1 });
  });
  it('n’agrège rien d’un autre tenant', async () => {
    const f = await Effect.runPromise(getBlogAdminFacets(`${orgId}-none`, 'fr', {}));
    expect(asMap(f.status)).toEqual({});
  });
});
