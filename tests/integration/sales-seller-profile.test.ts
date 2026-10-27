/** profil vendeur (sales_seller_profiles) : création, mise à jour sur la même ligne, refus d'un profil invalide, isolation par tenant (base réelle). */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { Effect } from 'effect';
import { eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, salesSellerProfiles, user } from '@database/schemas';
import { sellerProfileService } from '@/modules/sales/services/sellerProfile.service';
import { loadSellerProfile, toSellerProfile } from '@/modules/sales/loaders/sellerProfile.loader';

const db = getDrizzle();
const t = `seller-${Date.now().toString(36)}`;
const author = `${t}-author`;
const orgA = `${t}-a`;
const orgB = `${t}-b`;
const base = { legalName: 'Polyweb SAS', country: 'fr', vatNumber: 'fr 32 123456782', legalId: '732 829 320', legalIdScheme: '0002', iban: 'fr76 3000 6000 0112 3456 7890 189', bic: 'agrifrpp' };

beforeAll(async () => {
  await db.insert(user).values({ id: author, name: 'Seller author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values([orgA, orgB].map((id) => ({ id, name: id, slug: id, createdAt: new Date() })));
});

afterAll(async () => {
  await db.delete(salesSellerProfiles).where(inArray(salesSellerProfiles.organizationId, [orgA, orgB]));
  await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
  await db.delete(user).where(eq(user.id, author));
});

describe('profil vendeur', () => {
  it('crée puis met à jour la même ligne, valeurs normalisées', async () => {
    const created = await Effect.runPromise(sellerProfileService.save(base, orgA, author));
    expect(created).toMatchObject({ organizationId: orgA, country: 'FR', vatNumber: 'FR32123456782', legalId: '732829320', iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP', updatedBy: author });
    const updated = await Effect.runPromise(sellerProfileService.save({ ...base, city: 'Lyon' }, orgA, author));
    expect(updated.id).toBe(created.id);
    expect(updated.city).toBe('Lyon');
    const rows = await db.select().from(salesSellerProfiles).where(eq(salesSellerProfiles.organizationId, orgA));
    expect(rows).toHaveLength(1);
    expect(toSellerProfile(rows[0]!)).toMatchObject({ legalName: 'Polyweb SAS', city: 'Lyon' });
  });

  it('isolation par tenant', async () => {
    expect(await loadSellerProfile(orgB)).toBeNull();
    await Effect.runPromise(sellerProfileService.save({ ...base, legalName: 'Autre SAS' }, orgB, author));
    expect((await loadSellerProfile(orgB))?.legalName).toBe('Autre SAS');
    expect((await loadSellerProfile(orgA))?.legalName).toBe('Polyweb SAS');
  });

  it('profil invalide → BAD_REQUEST, rien écrit', async () => {
    const exit = await Effect.runPromiseExit(sellerProfileService.save({ ...base, iban: 'FR7630006000011234567890188' }, orgA, author));
    expect(exit._tag).toBe('Failure');
    expect(String(exit._tag === 'Failure' ? exit.cause : '')).toMatch(/BAD_REQUEST|IBAN|iban/);
    expect((await loadSellerProfile(orgA))?.iban).toBe('FR7630006000011234567890189');
  });
});
