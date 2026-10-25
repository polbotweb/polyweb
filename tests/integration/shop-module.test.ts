/** Module shop — catalogue localisé, variantes typées, portée tenant explicite (base réelle). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import {
  productOptions, productOptionTranslations, productOptionValues, productOptionValueTranslations,
  productTranslations, productVariantOptionValues, productVariants, shop,
} from '@database/schemas';
import { loadProductOptions, loadProductVariants, loadPublishedProductBySlug, loadPublishedProducts } from '@/modules/shop/loaders';
import { shopModule } from '@/modules/shop/module';

const tag = `shp-${Date.now()}`;
const ids: string[] = [];

beforeAll(async () => {
  const db = getDrizzle();
  const rows = await db.insert(shop).values([
    { slug: `${tag}-pub`, title: 'Pub', status: 'PUBLISHED', publishedAt: new Date() },
    { slug: `${tag}-draft`, title: 'Draft', status: 'DRAFT' },
  ]).returning({ id: shop.id });
  ids.push(...rows.map((r) => r.id));
  await db.insert(productTranslations).values([
    { productId: ids[0], locale: 'fr', title: 'T-shirt', slug: `${tag}-tshirt`, content: 'Coton' },
    { productId: ids[1], locale: 'fr', title: 'Brouillon', slug: `${tag}-brouillon`, content: '' },
  ]);
});

afterAll(async () => {
  if (ids.length) await getDrizzle().delete(shop).where(inArray(shop.id, ids));
});

describe('module shop', () => {
  it('déclare ses capacités avec fournisseurs', () => {
    expect(shopModule.capabilities.localization).toBe(true);
    expect(shopModule.capabilities.media).toBe(true);
  });

  it('lit un produit publié par slug localisé, masque brouillons et autre tenant', async () => {
    expect((await loadPublishedProductBySlug('fr', `${tag}-tshirt`))?.title).toBe('T-shirt');
    expect(await loadPublishedProductBySlug('en', `${tag}-tshirt`)).toBeNull();
    expect(await loadPublishedProductBySlug('fr', `${tag}-brouillon`)).toBeNull();
    expect(await loadPublishedProductBySlug('fr', `${tag}-tshirt`, 'org-inexistante')).toBeNull();
    const slugs = (await loadPublishedProducts('fr')).map((p) => p.slug);
    expect(slugs).toContain(`${tag}-tshirt`);
    expect(slugs).not.toContain(`${tag}-brouillon`);
  });

  it('modélise options, valeurs et variantes typées ; refuse doublons et prix négatif', async () => {
    const db = getDrizzle();
    const [size] = await db.insert(productOptions).values({ productId: ids[0], code: 'size', position: 0 }).returning({ id: productOptions.id });
    await db.insert(productOptionTranslations).values({ optionId: size.id, locale: 'fr', name: 'Taille' });
    const vals = await db.insert(productOptionValues).values([
      { optionId: size.id, code: 'l', position: 1 },
      { optionId: size.id, code: 'm', position: 0 },
    ]).returning({ id: productOptionValues.id });
    await db.insert(productOptionValueTranslations).values([
      { valueId: vals[0].id, locale: 'fr', label: 'L' },
      { valueId: vals[1].id, locale: 'fr', label: 'M' },
    ]);
    const vs = await db.insert(productVariants).values([
      { productId: ids[0], sku: 'TS-M', position: 0, priceMinor: 1900, currency: 'EUR' },
      { productId: ids[0], sku: 'TS-L', position: 1, priceMinor: 2100, currency: 'EUR', available: false },
    ]).returning({ id: productVariants.id });
    await db.insert(productVariantOptionValues).values([
      { variantId: vs[0].id, optionId: size.id, valueId: vals[1].id },
      { variantId: vs[1].id, optionId: size.id, valueId: vals[0].id },
    ]);

    const options = await loadProductOptions(ids[0], 'fr');
    expect(options).toEqual([{ id: size.id, code: 'size', name: 'Taille', values: [{ id: vals[1].id, code: 'm', label: 'M' }, { id: vals[0].id, code: 'l', label: 'L' }] }]);
    expect(await loadProductOptions(ids[0], 'en')).toEqual([]);
    const variants = await loadProductVariants(ids[0]);
    expect(variants.map((v) => [v.sku, v.available, v.valueIds])).toEqual([['TS-M', true, [vals[1].id]], ['TS-L', false, [vals[0].id]]]);

    await expect(db.insert(productVariants).values({ productId: ids[0], sku: 'TS-M', position: 2, priceMinor: 1, currency: 'EUR' })).rejects.toThrow();
    await expect(db.insert(productVariants).values({ productId: ids[0], sku: 'TS-X', position: 3, priceMinor: -1, currency: 'EUR' })).rejects.toThrow();
    await expect(db.insert(productVariantOptionValues).values({ variantId: vs[0].id, optionId: size.id, valueId: vals[0].id })).rejects.toThrow();
  });
});
