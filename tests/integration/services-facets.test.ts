/** Facettes de la liste admin des services (core/filters) — base réelle, tenant + exclusion de sa propre facette. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, services, user } from '@database/schemas';
import { getServiceAdminFacets } from '@/modules/services/admin/loader';

const db = getDrizzle();
const t = `sfac-${Date.now().toString(36)}`;
const owner = `${t}-u`;
const orgId = `${t}-org`;
const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

beforeAll(async () => {
  await db.insert(user).values({ id: owner, name: 'Facets', email: `${owner}@test.local` });
  await db.insert(organization).values({ id: orgId, name: 'Facets org', slug: orgId, createdAt: new Date() });
  await db.insert(services).values([
    { id: ids[0]!, providerId: owner, organizationId: orgId, slug: `${t}-0`, status: 'DRAFT', isFeatured: true },
    { id: ids[1]!, providerId: owner, organizationId: orgId, slug: `${t}-1`, status: 'PUBLISHED', publishedAt: new Date(), isFeatured: true },
    { id: ids[2]!, providerId: owner, organizationId: orgId, slug: `${t}-2`, status: 'PUBLISHED', publishedAt: new Date(), isFeatured: false },
  ]);
});
afterAll(async () => {
  await db.delete(services).where(inArray(services.id, ids));
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, owner));
});

const asMap = (b: readonly { value: string; count: number }[] | undefined) => Object.fromEntries((b ?? []).map((x) => [x.value, x.count]));

describe('getServiceAdminFacets', () => {
  it('compte dans le tenant uniquement', async () => {
    const f = await Effect.runPromise(getServiceAdminFacets(orgId, 'fr', {}));
    expect(asMap(f.status)).toEqual({ DRAFT: 1, PUBLISHED: 2 });
    expect(asMap(f.featured)).toEqual({ true: 2, false: 1 });
  });
  it('une facette ignore son propre filtre mais applique les autres', async () => {
    const f = await Effect.runPromise(getServiceAdminFacets(orgId, 'fr', { status: 'PUBLISHED', featured: true }));
    expect(asMap(f.status)).toEqual({ DRAFT: 1, PUBLISHED: 1 }); // filtré par featured=true seulement
    expect(asMap(f.featured)).toEqual({ true: 1, false: 1 }); // filtré par status=PUBLISHED seulement
  });
});
