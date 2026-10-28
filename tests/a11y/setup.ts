/**
 * A11y/Perf audit setup — creates seed users (regular + admin),
 * authenticates them, and exports session cookies for Pa11y-ci and Lighthouse CI.
 *
 * Run with: tsx tests/a11y/setup.ts [--teardown]
 */

import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:4321';
const COOKIES_PATH = resolve(import.meta.dirname, '../../.a11y-cookies.json');

export const SEED_USER = {
  email: 'a11y-seed@test.com',
  password: 'A11yTest1234!',
  name: 'A11y Seed User',
};

export const SEED_ADMIN = {
  email: 'a11y-admin@test.com',
  password: 'A11yAdmin1234!',
  name: 'A11y Admin User',
};

/** Delete a user and related rows by email */
async function deleteUser(email: string) {
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();

  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);

  if (existing.length > 0) {
    const userId = existing[0].id;
    await db.delete(schema.account).where(eq(schema.account.userId, userId)).catch(() => {});
    await db.delete(schema.session).where(eq(schema.session.userId, userId)).catch(() => {});
    await db.delete(schema.user).where(eq(schema.user.id, userId)).catch(() => {});
  }
}

/** Create a verified user and return their session cookie */
async function createAndAuth(seed: { email: string; password: string; name: string }) {
  const { auth } = await import('../../src/lib/auth');
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();

  // Clean up previous runs
  await deleteUser(seed.email);

  // Create user
  await auth.api.signUpEmail({
    body: { email: seed.email, password: seed.password, name: seed.name },
  });

  // Force email verification
  await db
    .update(schema.user)
    .set({ emailVerified: true })
    .where(eq(schema.user.email, seed.email));

  // Sign in via HTTP to get session cookie
  const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email: seed.email, password: seed.password }),
    redirect: 'manual',
  });

  const setCookie = response.headers.getSetCookie();
  if (!setCookie.length) {
    throw new Error(`No Set-Cookie header for ${seed.email}`);
  }

  // Extract cookie key=value pairs (drop attributes like Path, HttpOnly, etc.)
  const cookies = setCookie
    .map((h) => h.split(';')[0])
    .join('; ');

  return cookies;
}

/** Ressource publique (plateforme) pour auditer le parcours de réservation visiteur. */
export const A11Y_RESOURCE_CODE = 'A11YROOM';

async function deleteBookingResource() {
  const { getDrizzle } = await import('../../src/database/drizzle');
  const { bookings, bookingsResources } = await import('../../src/modules/bookings/schema');
  const { and, eq, isNull } = await import('drizzle-orm');
  const db = getDrizzle();
  const rows = await db
    .select({ id: bookingsResources.id })
    .from(bookingsResources)
    .where(and(eq(bookingsResources.code, A11Y_RESOURCE_CODE), isNull(bookingsResources.organizationId)));
  for (const { id } of rows) {
    await db.delete(bookings).where(eq(bookings.resourceId, id)).catch(() => {});
    await db.delete(bookingsResources).where(eq(bookingsResources.id, id)).catch(() => {});
  }
}

async function seedBookingResource() {
  const { getDrizzle } = await import('../../src/database/drizzle');
  const { bookingsResources } = await import('../../src/modules/bookings/schema');
  await deleteBookingResource();
  await getDrizzle().insert(bookingsResources).values({
    code: A11Y_RESOURCE_CODE,
    name: 'A11y room',
    kind: 'room',
    capacity: 4,
    timezone: 'UTC',
    slotMinutes: 60,
    windows: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '00:00', end: '24:00' })),
  });
}

/**
 * Boutique (catalogue plateforme) : produit A11Y publié dans les 4 locales, variante non suivie
 * en stock, un panier invité (cookie signé) et une commande en attente de paiement (lien de suivi
 * signé), plus une commande livrée portant une demande de retour (page de suivi avec retours,
 * liste et fiche admin des retours). Aucun appel au fournisseur de paiement. Le cookie et le jeton sont écrits dans
 * .a11y-cookies.json (ignoré par git) et caviardés des rapports Lighthouse.
 */
export const A11Y_SHOP_SKU = 'A11Y-TEE';
export const A11Y_SHOP_EMAIL = 'a11y-shop@test.com';
const A11Y_SHOP_SLUGS = { fr: 'a11y-t-shirt', en: 'a11y-t-shirt', es: 'a11y-camiseta', ar: 'a11y-qamis' } as const;

async function deleteShopSeed() {
  const { getDrizzle } = await import('../../src/database/drizzle');
  const { products, productVariants, orders, carts, cartLines } = await import('../../src/database/schemas');
  const { and, eq, inArray, isNull } = await import('drizzle-orm');
  const db = getDrizzle();
  await db.delete(orders).where(and(eq(orders.email, A11Y_SHOP_EMAIL), isNull(orders.organizationId))).catch(() => {});
  const variants = await db.select({ id: productVariants.id, productId: productVariants.productId }).from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.sku, A11Y_SHOP_SKU), isNull(products.organizationId)));
  if (variants.length === 0) return;
  const lines = await db.select({ cartId: cartLines.cartId }).from(cartLines).where(inArray(cartLines.variantId, variants.map((v) => v.id)));
  if (lines.length) await db.delete(carts).where(inArray(carts.id, lines.map((l) => l.cartId))).catch(() => {});
  await db.delete(products).where(inArray(products.id, variants.map((v) => v.productId))).catch(() => {});
}

async function seedShop() {
  const { getDrizzle } = await import('../../src/database/drizzle');
  const { products, productTranslations, productVariants, orders, orderLines } = await import('../../src/database/schemas');
  const { eq } = await import('drizzle-orm');
  const { Effect } = await import('effect');
  const { appRuntime } = await import('../../src/lib/effect/runtime');
  const { AppConfig } = await import('../../src/lib/effect/config');
  const { cartService } = await import('../../src/modules/shop/services/cart.service');
  const { createOrder } = await import('../../src/modules/shop/services/order.service');
  const { returnService } = await import('../../src/modules/shop/services/return.service');
  const { CART_COOKIE, orderAccessToken, signCartToken } = await import('../../src/modules/shop/domain/cart-token');
  await deleteShopSeed();
  const db = getDrizzle();
  const [product] = await db.insert(products).values({ organizationId: null, slug: A11Y_SHOP_SLUGS.fr, title: 'T-shirt A11y', status: 'PUBLISHED', publishedAt: new Date() }).returning();
  const titles = { fr: 'T-shirt A11y', en: 'A11y T-shirt', es: 'Camiseta A11y', ar: 'قميص A11y' } as const;
  await db.insert(productTranslations).values((Object.keys(A11Y_SHOP_SLUGS) as Array<keyof typeof A11Y_SHOP_SLUGS>).map((locale) => ({
    productId: product!.id, organizationId: null, locale, title: titles[locale], slug: A11Y_SHOP_SLUGS[locale], excerpt: titles[locale], content: '',
  })));
  const [variant] = await db.insert(productVariants).values({ productId: product!.id, sku: A11Y_SHOP_SKU, position: 1, priceMinor: 2400, currency: 'EUR' }).returning();
  const run = <A, E>(effect: import('effect').Effect.Effect<A, E, any>) => appRuntime.runPromise(effect as import('effect').Effect.Effect<A, E, never>);
  const secret = await run(Effect.gen(function* () { return (yield* AppConfig).signingSecret; }));
  // Deux paniers invités distincts (sans cartId, addItem en crée un nouveau à chaque fois).
  const cart = await run(cartService.addItem({ organizationId: null }, variant!.id, 2));
  const orderCart = await run(cartService.addItem({ organizationId: null }, variant!.id, 1));
  const order = await run(createOrder({
    organizationId: null, cartId: orderCart.id, userId: null, locale: 'fr',
    input: { email: A11Y_SHOP_EMAIL, customerName: 'A11y Shop', phone: '', addressLine1: '1 rue de la Paix', addressLine2: '', postcode: '75002', city: 'Paris', country: 'FR', shippingMethod: 'standard' },
  }));
  // Commande livrée (statut posé directement : pas de paiement réel) + retour d'une unité sur deux.
  const deliveredCart = await run(cartService.addItem({ organizationId: null }, variant!.id, 2));
  const delivered = await run(createOrder({
    organizationId: null, cartId: deliveredCart.id, userId: null, locale: 'fr',
    input: { email: A11Y_SHOP_EMAIL, customerName: 'A11y Retour', phone: '', addressLine1: '1 rue de la Paix', addressLine2: '', postcode: '75002', city: 'Paris', country: 'FR', shippingMethod: 'standard' },
  }));
  await db.update(orders).set({ status: 'DELIVERED' }).where(eq(orders.id, delivered.id));
  const [deliveredLine] = await db.select({ id: orderLines.id }).from(orderLines).where(eq(orderLines.orderId, delivered.id));
  const rma = await run(returnService.request({ orderId: delivered.id, organizationId: null, reason: 'damaged', note: 'Colis abîmé', lines: [{ orderLineId: deliveredLine!.id, quantity: 1 }] }));
  return {
    shopCartCookie: `${CART_COOKIE}=${signCartToken(cart.id, secret)}`,
    shopOrder: { id: order.id, token: orderAccessToken(order.id, secret) },
    shopReturn: { orderId: delivered.id, token: orderAccessToken(delivered.id, secret), id: rma.id },
    shopSlugs: A11Y_SHOP_SLUGS,
  };
}

/**
 * Logistique (tenant plateforme) : deux entrepôts, un article stocké, un inventaire validé (écart posté
 * au grand livre) et un inventaire en cours (saisie des comptages) — pages inventaires et grand livre.
 */
export const A11Y_WAREHOUSE_CODES = ['A11Y-WH', 'A11Y-WH2'] as const;
export const A11Y_LOGISTICS_SKU = 'A11Y-BOX';

async function deleteLogisticsSeed() {
  const { getDrizzle } = await import('../../src/database/drizzle');
  const { logisticsInventoryCounts, logisticsItems, logisticsStockMovements, logisticsWarehouses } = await import('../../src/database/schemas');
  const { and, eq, inArray, isNull } = await import('drizzle-orm');
  const db = getDrizzle();
  const warehouses = await db.select({ id: logisticsWarehouses.id }).from(logisticsWarehouses)
    .where(and(inArray(logisticsWarehouses.code, [...A11Y_WAREHOUSE_CODES]), isNull(logisticsWarehouses.organizationId)));
  const ids = warehouses.map((w) => w.id);
  if (ids.length) {
    await db.delete(logisticsInventoryCounts).where(inArray(logisticsInventoryCounts.warehouseId, ids));
    await db.delete(logisticsStockMovements).where(inArray(logisticsStockMovements.warehouseId, ids));
    await db.delete(logisticsWarehouses).where(inArray(logisticsWarehouses.id, ids));
  }
  await db.delete(logisticsItems).where(and(eq(logisticsItems.sku, A11Y_LOGISTICS_SKU), isNull(logisticsItems.organizationId))).catch(() => {});
}

async function seedLogistics(adminEmail: string) {
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { eq } = await import('drizzle-orm');
  const { Effect } = await import('effect');
  const { logisticsService } = await import('../../src/modules/logistics/services/logistics.service');
  const { inventoryService } = await import('../../src/modules/logistics/services/inventory.service');
  const { inventoryLoader } = await import('../../src/modules/logistics/loaders');
  await deleteLogisticsSeed();
  const [admin] = await getDrizzle().select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, adminEmail)).limit(1);
  const authorId = admin!.id;
  const run = <A, E>(effect: import('effect').Effect.Effect<A, E>) => Effect.runPromise(effect);
  const [main, backup] = await Promise.all(A11Y_WAREHOUSE_CODES.map((code, index) =>
    run(logisticsService.createWarehouse({ organizationId: null, code, name: index === 0 ? 'Entrepôt A11y' : 'Entrepôt A11y secours', country: 'FR' }))));
  await run(logisticsService.createItem({ organizationId: null, sku: A11Y_LOGISTICS_SKU, name: 'Carton A11y' }));
  await run(logisticsService.recordMovement({ organizationId: null, warehouseId: main!.id, sku: A11Y_LOGISTICS_SKU, kind: 'receipt', quantity: 12, reference: 'A11Y-PO' }, authorId));
  await run(logisticsService.transfer({ organizationId: null, fromWarehouseId: main!.id, toWarehouseId: backup!.id, sku: A11Y_LOGISTICS_SKU, quantity: 2 }, authorId));
  // Inventaire validé (écart −1) puis inventaire en cours avec un comptage saisi.
  const validated = await run(inventoryService.open({ organizationId: null, warehouseId: main!.id, note: 'Inventaire A11y' }, authorId));
  const validatedLine = (await run(inventoryLoader.count(validated.id, null)))!.lines.find((line) => line.sku === A11Y_LOGISTICS_SKU)!;
  await run(inventoryService.recordCounts(validated.id, null, [{ lineId: validatedLine.id, counted: '9' }], authorId));
  await run(inventoryService.validate(validated.id, null, authorId));
  const open = await run(inventoryService.open({ organizationId: null, warehouseId: main!.id }, authorId));
  const openLine = (await run(inventoryLoader.count(open.id, null)))!.lines.find((line) => line.sku === A11Y_LOGISTICS_SKU)!;
  await run(inventoryService.recordCounts(open.id, null, [{ lineId: openLine.id, counted: '9' }], authorId));
  return { logistics: { openCountId: open.id, validatedCountId: validated.id } };
}

/**
 * Exports FEC : un tenant avec profil vendeur (export prêt, période sans écriture) et un tenant sans
 * SIREN (export en échec motivé) ; fichiers en stockage privé, supprimés au nettoyage.
 */
export const A11Y_FEC_ORGS = ['a11y-fec-org', 'a11y-fec-nosiren'] as const;
export const A11Y_FEC_PERIOD = '2000-01';

async function deleteFecSeed() {
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { salesFecExports } = await import('../../src/database/schemas');
  const { privateStorage } = await import('../../src/lib/storage/private');
  const { Effect } = await import('effect');
  const { inArray } = await import('drizzle-orm');
  const db = getDrizzle();
  const rows = await db.select({ storageKey: salesFecExports.storageKey }).from(salesFecExports).where(inArray(salesFecExports.organizationId, [...A11Y_FEC_ORGS]));
  for (const row of rows) if (row.storageKey) await Effect.runPromise(Effect.ignore(privateStorage().remove(row.storageKey)));
  // Cascade : profils vendeurs et exports du tenant.
  await db.delete(schema.organization).where(inArray(schema.organization.id, [...A11Y_FEC_ORGS]));
}

async function seedFec() {
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { salesSellerProfiles } = await import('../../src/database/schemas');
  const { Effect } = await import('effect');
  const { PrivateStorage, privateStorage } = await import('../../src/lib/storage/private');
  const { fecExportService } = await import('../../src/modules/sales/services/fecExport.service');
  await deleteFecSeed();
  const db = getDrizzle();
  await db.insert(schema.organization).values([
    { id: A11Y_FEC_ORGS[0], name: 'Tenant FEC A11y', slug: A11Y_FEC_ORGS[0], createdAt: new Date() },
    { id: A11Y_FEC_ORGS[1], name: 'Tenant FEC sans SIREN', slug: A11Y_FEC_ORGS[1], createdAt: new Date() },
  ]);
  await db.insert(salesSellerProfiles).values({ organizationId: A11Y_FEC_ORGS[0], legalName: 'Vendeur A11y', legalId: '732829320', legalIdScheme: '0002', country: 'FR' });
  for (const organizationId of A11Y_FEC_ORGS) {
    await Effect.runPromise(fecExportService.generate({ organizationId, period: A11Y_FEC_PERIOD, authorId: null }).pipe(Effect.provideService(PrivateStorage, privateStorage())));
  }
}

async function setup() {
  process.env.NODE_ENV = 'test';

  console.log('[a11y] Creating seed users…');

  const userCookie = await createAndAuth(SEED_USER);
  const adminCookie = await createAndAuth(SEED_ADMIN);

  // Promote admin user
  await import('../../src/lib/auth');
  const { getDrizzle, schema } = await import('../../src/database/drizzle');
  const { eq } = await import('drizzle-orm');
  const db = getDrizzle();

  const adminRow = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, SEED_ADMIN.email))
    .limit(1);

  if (adminRow.length > 0) {
    await db
      .update(schema.user)
      .set({ role: 'admin' })
      .where(eq(schema.user.id, adminRow[0].id));
  }

  // Re-authenticate admin to get a session with the updated role
  const adminResponse = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email: SEED_ADMIN.email, password: SEED_ADMIN.password }),
    redirect: 'manual',
  });
  const adminSetCookie = adminResponse.headers.getSetCookie();
  const freshAdminCookie = adminSetCookie.length
    ? adminSetCookie.map((h) => h.split(';')[0]).join('; ')
    : adminCookie;

  await seedBookingResource();
  console.log(`[a11y] Booking resource ${A11Y_RESOURCE_CODE} seeded`);

  const shop = await seedShop();
  console.log(`[a11y] Shop product ${A11Y_SHOP_SKU}, guest cart and pending order seeded`);

  const logistics = await seedLogistics(SEED_ADMIN.email);
  console.log(`[a11y] Logistics warehouses ${A11Y_WAREHOUSE_CODES.join(', ')}, item ${A11Y_LOGISTICS_SKU} and stock counts seeded`);

  await seedFec();
  console.log(`[a11y] FEC exports (${A11Y_FEC_PERIOD}) seeded for ${A11Y_FEC_ORGS.join(', ')}`);

  const data = { userCookie, adminCookie: freshAdminCookie, ...shop, ...logistics };
  writeFileSync(COOKIES_PATH, JSON.stringify(data, null, 2));
  console.log(`[a11y] Cookies written to ${COOKIES_PATH}`);
}

async function teardown() {
  process.env.NODE_ENV = 'test';

  console.log('[a11y] Cleaning up seed users…');
  await deleteUser(SEED_USER.email);
  await deleteUser(SEED_ADMIN.email);
  await deleteBookingResource();
  await deleteShopSeed();
  await deleteLogisticsSeed();
  await deleteFecSeed();

  if (existsSync(COOKIES_PATH)) {
    unlinkSync(COOKIES_PATH);
  }
  console.log('[a11y] Teardown complete.');
}

// CLI entry point
const isTeardown = process.argv.includes('--teardown');
if (isTeardown) {
  teardown().catch((err) => { console.error(err); process.exit(1); });
} else {
  setup().catch((err) => { console.error(err); process.exit(1); });
}
