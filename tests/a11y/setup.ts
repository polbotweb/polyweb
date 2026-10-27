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
 * signé). Aucun appel au fournisseur de paiement. Le cookie et le jeton sont écrits dans
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
  const { products, productTranslations, productVariants } = await import('../../src/database/schemas');
  const { Effect } = await import('effect');
  const { appRuntime } = await import('../../src/lib/effect/runtime');
  const { AppConfig } = await import('../../src/lib/effect/config');
  const { cartService } = await import('../../src/modules/shop/services/cart.service');
  const { createOrder } = await import('../../src/modules/shop/services/order.service');
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
  return {
    shopCartCookie: `${CART_COOKIE}=${signCartToken(cart.id, secret)}`,
    shopOrder: { id: order.id, token: orderAccessToken(order.id, secret) },
    shopSlugs: A11Y_SHOP_SLUGS,
  };
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

  const data = { userCookie, adminCookie: freshAdminCookie, ...shop };
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
