/**
 * Taxonomie générique de catégories (core/taxonomy) — base réelle.
 * CRUD tenant-aware via les actions `events.categories.*`, refus de cycle, refus de suppression
 * avec enfants, assignation limitée au tenant de la ressource, admin d'une autre organisation
 * refusé, filtre + facette « catégorie » de la liste admin, et adaptateurs blog/services lisant
 * les données existantes (aucune migration de données).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: any) => def };
});
vi.mock('@/lib/auth', () => ({ auth: { api: { userHasPermission: vi.fn(() => Promise.resolve({ success: false })) } } }));

import { Effect } from 'effect';
import { and, eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { blogCategories, blogCategoryTranslations, blogPostCategories, blogPosts, blogPostTranslations, member, organization, user } from '@database/schemas';
import { serviceCategories, serviceCategoryLinks, serviceCategoryTranslations, services } from '@database/schemas/services.schema';
import { eventCategoryLinks, events } from '@/modules/events/schema';
import { eventsActions } from '@/modules/events/actions';
import { eventsCategoryTaxonomy } from '@/modules/events/taxonomy';
import { eventsAdminConditions, eventsAdminFacets, eventsAdminFiltersFromUrl } from '@/modules/events/loaders/event-admin.loader';
import { blogCategoryTaxonomy } from '@/modules/blog/taxonomy';
import { servicesCategoryTaxonomy } from '@/modules/services/taxonomy';
import { getBlogAdminFacets } from '@database/loaders/blog-admin.loader';
import { getServiceAdminFacets } from '@/modules/services/admin/loader';
import { categoryTaxonomyFor, registeredCategoryTaxonomies } from '@/core/taxonomy';
import { resetRateLimiter } from '@/lib/rate-limit';

const db = getDrizzle();
const t = `ctx-${Date.now().toString(36)}`;
const orgA = `${t}-org-a`;
const orgB = `${t}-org-b`;
const u = { adminA: `${t}-admin-a`, ownerB: `${t}-owner-b` };
const ctx = (who: keyof typeof u) => ({
  locals: { user: { id: u[who], role: 'user', email: `${u[who]}@test.local`, banned: false }, session: { id: `${u[who]}-s` } },
  request: { headers: new Headers() },
  clientAddress: '127.0.0.1',
}) as any;
const h = (a: unknown) => (a as any).handler as (i: any, c: any) => Promise<any>;
const cat = eventsActions.categories;
const tr = (slug: string, name = slug) => [{ locale: 'fr', name, slug }];
const asMap = (b: readonly { value: string; count: number }[] | undefined) => Object.fromEntries((b ?? []).map((x) => [x.value, x.count]));

const eventA1 = crypto.randomUUID();
const eventA2 = crypto.randomUUID();
const eventB = crypto.randomUUID();
const blogPost = crypto.randomUUID();
const blogCat = crypto.randomUUID();
const service = crypto.randomUUID();
const serviceCat = crypto.randomUUID();

beforeAll(async () => {
  await db.insert(user).values(Object.values(u).map((id) => ({ id, name: id, email: `${id}@test.local`, role: 'user' })));
  await db.insert(organization).values([
    { id: orgA, name: 'A', slug: orgA, createdAt: new Date() },
    { id: orgB, name: 'B', slug: orgB, createdAt: new Date() },
  ]);
  await db.insert(member).values([
    { id: `${t}-m1`, organizationId: orgA, userId: u.adminA, role: 'admin', createdAt: new Date() },
    { id: `${t}-m2`, organizationId: orgB, userId: u.ownerB, role: 'owner', createdAt: new Date() },
  ]);
  await db.insert(events).values([
    { id: eventA1, organizationId: orgA, slug: `${t}-a1`, title: 'A1' },
    { id: eventA2, organizationId: orgA, slug: `${t}-a2`, title: 'A2' },
    { id: eventB, organizationId: orgB, slug: `${t}-b`, title: 'B' },
  ]);
  // Données blog/services « historiques » écrites directement (forme existante, aucune migration).
  await db.insert(blogPosts).values({ id: blogPost, organizationId: orgA, authorId: u.adminA, slug: `${t}-post`, status: 'DRAFT' });
  await db.insert(blogPostTranslations).values({ postId: blogPost, organizationId: orgA, locale: 'fr', title: 'Billet', slug: `${t}-post-fr`, content: 'x' });
  await db.insert(blogCategories).values({ id: blogCat, organizationId: orgA, slug: `${t}-news` });
  await db.insert(blogCategoryTranslations).values({ categoryId: blogCat, organizationId: orgA, locale: 'fr', name: 'Actualités', slug: `${t}-actualites` });
  await db.insert(blogPostCategories).values({ postId: blogPost, categoryId: blogCat });
  await db.insert(services).values({ id: service, providerId: u.adminA, organizationId: orgA, slug: `${t}-svc` });
  await db.insert(serviceCategories).values({ id: serviceCat, organizationId: orgA, slug: `${t}-svc-cat` });
  await db.insert(serviceCategoryTranslations).values({ categoryId: serviceCat, organizationId: orgA, locale: 'fr', name: 'Plomberie', slug: `${t}-plomberie` });
  await db.insert(serviceCategoryLinks).values({ serviceId: service, categoryId: serviceCat });
});

afterAll(async () => {
  await db.delete(blogPosts).where(eq(blogPosts.id, blogPost));
  await db.delete(blogCategories).where(eq(blogCategories.id, blogCat));
  await db.delete(services).where(eq(services.id, service));
  await db.delete(serviceCategories).where(eq(serviceCategories.id, serviceCat));
  await db.delete(events).where(inArray(events.id, [eventA1, eventA2, eventB]));
  await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
  await db.delete(user).where(inArray(user.id, Object.values(u)));
});

describe('core/taxonomy — events.categories (CRUD tenant-aware)', () => {
  let parent = '';
  let child = '';
  let catB = '';

  it("l'admin de A crée une catégorie et une sous-catégorie dans A ; l'arbre est localisé sans repli", async () => {
    resetRateLimiter();
    parent = (await h(cat.create)({ organizationId: orgA, slug: `${t}-music`, translations: tr(`${t}-musique`, 'Musique') }, ctx('adminA'))).id;
    child = (await h(cat.create)({ organizationId: orgA, slug: `${t}-jazz`, parentId: parent, translations: tr(`${t}-jazz-fr`, 'Jazz') }, ctx('adminA'))).id;
    const tree = await h(cat.list)({ organizationId: orgA, locale: 'fr' }, ctx('adminA'));
    const node = tree.find((n: any) => n.id === parent);
    expect(node).toMatchObject({ name: 'Musique', organizationId: orgA });
    expect(node.children.map((c: any) => c.id)).toEqual([child]);
    const en = await h(cat.list)({ organizationId: orgA, locale: 'en' }, ctx('adminA'));
    expect(en.find((n: any) => n.id === parent).name).toBeNull();
  });

  it('slug en double dans le même tenant → CONFLICT ; même slug dans un autre tenant accepté', async () => {
    await expect(h(cat.create)({ organizationId: orgA, slug: `${t}-music`, translations: tr(`${t}-autre`) }, ctx('adminA'))).rejects.toMatchObject({ code: 'CONFLICT' });
    catB = (await h(cat.create)({ organizationId: orgB, slug: `${t}-music`, translations: tr(`${t}-musique`, 'Musique B') }, ctx('ownerB'))).id;
    expect(catB).toBeTruthy();
  });

  it('cycle refusé (parent = descendant ou soi-même)', async () => {
    await expect(h(cat.update)({ id: parent, parentId: child }, ctx('adminA'))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(h(cat.update)({ id: parent, parentId: parent }, ctx('adminA'))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    // Parent d'un autre tenant : refusé aussi (les nœuds candidats sont ceux du même tenant).
    await expect(h(cat.update)({ id: child, parentId: catB }, ctx('adminA'))).rejects.toBeTruthy();
  });

  it("autre organisation refusée : l'owner de B ne gère pas les catégories de A", async () => {
    await expect(h(cat.create)({ organizationId: orgA, slug: `${t}-x`, translations: tr(`${t}-x`) }, ctx('ownerB'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(cat.update)({ id: parent, translations: tr(`${t}-pirate`, 'Pirate') }, ctx('ownerB'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(cat.remove)({ id: child }, ctx('ownerB'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(cat.list)({ organizationId: orgA, locale: 'fr' }, ctx('ownerB'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(h(cat.assign)({ resourceId: eventA1, categoryIds: [catB] }, ctx('ownerB'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it("assignation : catégories du tenant de la ressource uniquement (catégorie d'un autre tenant → FORBIDDEN)", async () => {
    await expect(h(cat.assign)({ resourceId: eventA1, categoryIds: [catB] }, ctx('adminA'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await h(cat.assign)({ resourceId: eventA1, categoryIds: [parent, child] }, ctx('adminA'));
    await h(cat.assign)({ resourceId: eventA2, categoryIds: [parent] }, ctx('adminA'));
    await h(cat.assign)({ resourceId: eventB, categoryIds: [catB] }, ctx('ownerB'));
    const links = await db.select().from(eventCategoryLinks).where(inArray(eventCategoryLinks.eventId, [eventA1, eventA2]));
    expect(links).toHaveLength(3);
    const refs = await Effect.runPromise(eventsCategoryTaxonomy.categoriesOf(orgA, 'fr', [eventA1, eventA2]));
    expect(refs.get(eventA1)?.map((r) => r.name).sort()).toEqual(['Jazz', 'Musique']);
  });

  it('filtre et facette « catégorie » de la liste admin : comptés dans le tenant, sans leur propre filtre', async () => {
    const filters = eventsAdminFiltersFromUrl(`categoryId=${child}`);
    expect(filters.categoryId).toBe(child);
    expect(eventsAdminFiltersFromUrl('categoryId=not-a-uuid').categoryId).toBeUndefined();
    const rows = await db.select({ id: events.id }).from(events).where(and(...eventsAdminConditions(orgA, filters)));
    expect(rows.map((r) => r.id)).toEqual([eventA1]);
    const facets = await Effect.runPromise(eventsAdminFacets(orgA, filters));
    expect(asMap(facets.category)).toEqual({ [parent]: 2, [child]: 1 });
    expect(asMap(facets.status)).toEqual({ DRAFT: 1 });
    const facetsB = await Effect.runPromise(eventsAdminFacets(orgB, {}));
    expect(asMap(facetsB.category)).toEqual({ [catB]: 1 });
  });

  it('suppression refusée tant que la catégorie a des enfants ; possible ensuite', async () => {
    await expect(h(cat.remove)({ id: parent }, ctx('adminA'))).rejects.toMatchObject({ code: 'CONFLICT' });
    await h(cat.remove)({ id: child }, ctx('adminA'));
    await h(cat.remove)({ id: parent }, ctx('adminA'));
    const tree = await h(cat.list)({ organizationId: orgA, locale: 'fr' }, ctx('adminA'));
    expect(tree.find((n: any) => n.id === parent)).toBeUndefined();
  });
});

describe('core/taxonomy — adaptateurs blog/services (données existantes, sans migration)', () => {
  it('les modules adhérents sont enregistrés', () => {
    expect(registeredCategoryTaxonomies()).toEqual(expect.arrayContaining(['blog', 'events', 'services']));
    expect(categoryTaxonomyFor('blog')).toBe(blogCategoryTaxonomy);
  });

  it('blog : lit les catégories et liaisons historiques ; facette catégorie de la liste admin', async () => {
    const list = await Effect.runPromise(blogCategoryTaxonomy.list(orgA, 'fr'));
    expect(list.find((c) => c.id === blogCat)).toMatchObject({ name: 'Actualités', slug: `${t}-news` });
    const refs = await Effect.runPromise(blogCategoryTaxonomy.categoriesOf(orgA, 'fr', [blogPost]));
    expect(refs.get(blogPost)?.map((r) => r.id)).toEqual([blogCat]);
    const facets = await Effect.runPromise(getBlogAdminFacets(orgA, 'fr', {}));
    expect(asMap(facets.category)).toEqual({ [blogCat]: 1 });
    expect(asMap((await Effect.runPromise(getBlogAdminFacets(orgB, 'fr', {}))).category)).toEqual({});
  });

  it('services : lit les catégories et liaisons historiques ; facette catégorie de la liste admin', async () => {
    const list = await Effect.runPromise(servicesCategoryTaxonomy.list(orgA, 'fr'));
    expect(list.find((c) => c.id === serviceCat)).toMatchObject({ name: 'Plomberie' });
    const refs = await Effect.runPromise(servicesCategoryTaxonomy.categoriesOf(orgA, 'fr', [service]));
    expect(refs.get(service)?.map((r) => r.id)).toEqual([serviceCat]);
    const facets = await Effect.runPromise(getServiceAdminFacets(orgA, 'fr', {}));
    expect(asMap(facets.category)).toEqual({ [serviceCat]: 1 });
  });
});
