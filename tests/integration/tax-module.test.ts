/** Module tax — liste admin filtrée/facettée, surcharges actives appliquées au calcul (base réelle). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { tax } from '@database/schemas';
import { computeDocumentTax, DEFAULT_TAX_RATES } from '@/modules/tax/domain/rates';
import { loadTaxAdminFacets, taxActiveRates, taxAdminById, taxAdminFiltersFromUrl, taxAdminList } from '@/modules/tax/loaders';
import { taxModule } from '@/modules/tax/module';

const tag = `tax-${Date.now()}`;
const ids: string[] = [];

beforeAll(async () => {
  const rows = await getDrizzle().insert(tax).values([
    { slug: `${tag}-mt-b2b`, title: `${tag} MT B2B`, status: 'PUBLISHED', countryCode: 'MT', category: 'standard', customerType: 'B2B', ratePercent: '12.5', validFrom: '2099-01-01' },
    { slug: `${tag}-mt-draft`, title: `${tag} MT brouillon`, status: 'DRAFT', countryCode: 'MT', category: 'reduced', ratePercent: '3' },
  ]).returning({ id: tax.id });
  ids.push(...rows.map((r) => r.id));
});

afterAll(async () => {
  if (ids.length) await getDrizzle().delete(tax).where(inArray(tax.id, ids));
});

describe('module tax', () => {
  it('déclare un module sans localisation', () => {
    expect(taxModule.capabilities.localization).toBe(false);
  });

  it('liste filtrée par recherche, pays et catégorie ; facettes', async () => {
    const params = new URLSearchParams({ search: tag });
    const all = await Effect.runPromise(taxAdminList(null, params));
    expect(all.items.map((i) => i.slug).sort()).toEqual([`${tag}-mt-b2b`, `${tag}-mt-draft`]);
    const reduced = await Effect.runPromise(taxAdminList(null, new URLSearchParams({ search: tag, category: 'reduced' })));
    expect(reduced.items.map((i) => i.slug)).toEqual([`${tag}-mt-draft`]);
    const facets = await loadTaxAdminFacets(null, taxAdminFiltersFromUrl(params));
    expect(facets.category?.find((b) => b.value === 'standard')?.count).toBe(1);
    expect(await Effect.runPromise(taxAdminById(ids[0], 'org-inexistante'))).toBeNull();
    expect((await Effect.runPromise(taxAdminById(ids[0], null)))?.ratePercent).toBe('12.5000');
  });

  it('applique les surcharges PUBLISHED (pas les brouillons) avant les taux par défaut', async () => {
    const active = await Effect.runPromise(taxActiveRates(null));
    expect(active.some((r) => r.countryCode === 'MT' && r.ratePercent === '12.5000')).toBe(true);
    expect(active.some((r) => r.countryCode === 'MT' && r.ratePercent === '3.0000')).toBe(false);
    const rates = [...DEFAULT_TAX_RATES, ...active];
    const context = { sellerCountry: 'MT', buyerCountry: 'MT', customerType: 'B2B', supplyType: 'services' } as const;
    const lines = [{ net: { amountMinor: 10000, currency: 'EUR' as const }, category: 'standard' as const }];
    const overridden = Effect.runSync(computeDocumentTax(lines, { context, currency: 'EUR', date: '2099-06-01', rates }));
    expect(overridden.totals.tax.amountMinor).toBe(1250);
    const before = Effect.runSync(computeDocumentTax(lines, { context, currency: 'EUR', date: '2098-06-01', rates }));
    expect(before.totals.tax.amountMinor).toBe(1800);
  });
});
