/**
 * Boutique — panier, commande, réservation de stock et paiement shop-order (base réelle,
 * fournisseur de paiement mock uniquement : aucun appel Stripe).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) { super(message); this.code = code; }
  }
  return { ActionError, defineAction: (def: unknown) => def };
});

import { Effect, Exit } from 'effect';
import { eq, inArray, like } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, payments, user, products, productVariants, orders, orderLines, carts, logisticsStockReservations } from '@database/schemas';
import { paymentEvents } from '@database/schemas/payments.schema';
import { refunds } from '@database/schemas/refunds.schema';
import { registerRefundsCore, requestRefund } from '@/core/refunds';
import { appRuntime } from '@/lib/effect/runtime';
import { gatewayOf, handleWebhook, makeMockProvider, MOCK_SIGNATURE_HEADER, mockWebhookBody, PaymentGateway, signMockPayload, type PaymentEventKind } from '@/core/payments';
import { logisticsService } from '@/modules/logistics/services/logistics.service';
import { logisticsLoader } from '@/modules/logistics/loaders';
import { cartService } from '@/modules/shop/services/cart.service';
import { checkoutOrder, createOrder, orderService, reservationReference } from '@/modules/shop/services/order.service';
import { registerShopPayments, sweepShopOrders } from '@/modules/shop/payments';
import { registerShopRefunds } from '@/modules/shop/refunds';
import type { CheckoutInput } from '@/modules/shop/domain/checkout';

const SECRET = 'itest-mock-secret';
const db = getDrizzle();
const t = `shop-${Date.now().toString(36)}`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const author = `${t}-author`;
const buyer = `${t}-buyer`;
const provider = makeMockProvider(SECRET);
const run = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromise(Effect.provideService(e, PaymentGateway, gatewayOf(provider)) as Effect.Effect<A, E, never>);
const failure = async <A, E>(e: Effect.Effect<A, E, any>) => {
  const exit = await appRuntime.runPromiseExit(Effect.provideService(e, PaymentGateway, gatewayOf(provider)) as Effect.Effect<A, E, never>);
  if (Exit.isSuccess(exit)) throw new Error('succès inattendu');
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return (reason as { error: { code?: string; _tag: string; sku?: string; field?: string; fields?: readonly string[] } } | undefined)?.error;
};
const urls = () => ({ successUrl: 'https://example.test/ok', cancelUrl: 'https://example.test/ko' });

let seq = 0;
const webhook = (kind: PaymentEventKind, paymentId: string, amountMinor: number | null) => {
  const body = mockWebhookBody({
    eventId: `evt_${t}_${seq++}`, type: `mock.${kind}`, kind, paymentId, providerPaymentId: `mock_pi_${paymentId}`, sessionId: null,
    amount: amountMinor === null ? null : { amountMinor, currency: 'EUR' },
  });
  return run(handleWebhook(body, new Headers({ [MOCK_SIGNATURE_HEADER]: signMockPayload(body, SECRET) })));
};

const address: CheckoutInput = {
  email: 'Client@Test.Local', customerName: 'Client Test', phone: '', addressLine1: '1 rue de la Paix', addressLine2: '',
  postcode: '75002', city: 'Paris', country: 'fr', shippingMethod: 'standard',
};

let warehouseId = '';
let tracked = '';
let untracked = '';
let draft = '';
let foreign = '';

const reload = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!;
const level = async () => (await run(logisticsLoader.stockLevels(orgId, warehouseId))).find((row) => row.sku === `${t}-TEE`.toUpperCase())?.level ?? 0;

const product = async (organizationId: string, status: 'PUBLISHED' | 'DRAFT', sku: string, priceMinor: number) => {
  const [p] = await db.insert(products).values({ organizationId, slug: `${sku}`.toLowerCase(), title: `Produit ${sku}`, status }).returning();
  const [v] = await db.insert(productVariants).values({ productId: p!.id, sku, position: 1, priceMinor, currency: 'EUR' }).returning();
  return v!.id;
};

const freshCart = async (variantId: string, quantity: number, userId: string | null = null) => {
  const cart = await run(cartService.addItem({ organizationId: orgId, userId }, variantId, quantity));
  return cart.id;
};

beforeAll(async () => {
  await db.insert(user).values([
    { id: author, name: 'Shop author', email: `${author}@test.local`, role: 'admin' },
    { id: buyer, name: 'Shop buyer', email: `${buyer}@test.local`, role: 'user' },
  ]);
  await db.insert(organization).values([
    { id: orgId, name: 'Shop org', slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: 'Shop other', slug: otherOrg, createdAt: new Date() },
  ]);
  tracked = await product(orgId, 'PUBLISHED', `${t}-TEE`, 2400);
  untracked = await product(orgId, 'PUBLISHED', `${t}-EBOOK`, 1200);
  draft = await product(orgId, 'DRAFT', `${t}-DRAFT`, 1000);
  foreign = await product(otherOrg, 'PUBLISHED', `${t}-FOREIGN`, 1000);
  warehouseId = (await run(logisticsService.createWarehouse({ organizationId: orgId, code: 'SHOP', name: 'Boutique' }))).id;
  await run(logisticsService.createItem({ organizationId: orgId, sku: `${t}-TEE`, name: 'T-shirt', variantId: tracked }));
  await run(logisticsService.recordMovement({ organizationId: orgId, warehouseId, sku: `${t}-TEE`, kind: 'receipt', quantity: 5 }, author));
  registerShopPayments();
  registerRefundsCore();
  registerShopRefunds();
});

afterAll(async () => {
  const pids = (await db.select({ id: payments.id }).from(payments).where(inArray(payments.organizationId, [orgId, otherOrg]))).map((r) => r.id);
  if (pids.length) {
    await db.delete(refunds).where(inArray(refunds.paymentId, pids));
    await db.delete(paymentEvents).where(inArray(paymentEvents.paymentId, pids));
  }
  await db.delete(paymentEvents).where(like(paymentEvents.eventId, `evt_${t}_%`));
  const oids = (await db.select({ id: orders.id }).from(orders).where(inArray(orders.organizationId, [orgId, otherOrg]))).map((r) => r.id);
  if (oids.length) {
    await db.delete(orderLines).where(inArray(orderLines.orderId, oids));
    await db.delete(orders).where(inArray(orders.id, oids));
  }
  await db.delete(payments).where(inArray(payments.organizationId, [orgId, otherOrg]));
  await db.delete(carts).where(inArray(carts.organizationId, [orgId, otherOrg]));
  await db.delete(organization).where(inArray(organization.id, [orgId, otherOrg]));
  await db.delete(user).where(inArray(user.id, [author, buyer]));
});

describe('boutique : panier', () => {
  it('refuse les variantes non publiées, d’un autre tenant ou en quantité invalide', async () => {
    expect((await failure(cartService.addItem({ organizationId: orgId }, draft, 1)))?.code).toBe('NOT_FOUND');
    expect((await failure(cartService.addItem({ organizationId: orgId }, foreign, 1)))?.code).toBe('NOT_FOUND');
    expect(await failure(cartService.addItem({ organizationId: orgId }, tracked, 0))).toMatchObject({ _tag: 'InvalidCartError', field: 'quantity' });
    expect(await failure(cartService.addItem({ organizationId: orgId }, tracked, 100))).toMatchObject({ _tag: 'InvalidCartError', field: 'quantity' });
  });

  it('cumule les quantités, plafonne à 99 et expose le stock disponible', async () => {
    const cartId = await freshCart(tracked, 2);
    await run(cartService.addItem({ organizationId: orgId, cartId }, tracked, 98));
    await run(cartService.addItem({ organizationId: orgId, cartId }, untracked, 1));
    const view = await run(cartService.view({ organizationId: orgId, cartId }, 'fr'));
    expect(view.lines.map((l) => [l.sku, l.quantity, l.available])).toEqual([[`${t}-TEE`, 99, 5], [`${t}-EBOOK`, 1, null]]);
    expect(view.orderable).toBe(false);
    const line = view.lines[0]!;
    await run(cartService.setQuantity({ organizationId: orgId, cartId }, line.lineId, 0));
    const after = await run(cartService.view({ organizationId: orgId, cartId }, 'fr'));
    expect(after.lines).toHaveLength(1);
    expect(after).toMatchObject({ totalMinor: 1200, itemCount: 1, orderable: true });
    // Un autre tenant ne voit pas ce panier.
    expect((await run(cartService.view({ organizationId: otherOrg, cartId }, 'fr'))).lines).toHaveLength(0);
  });

  it('fusionne le panier invité dans celui de l’utilisateur connecté', async () => {
    const guest = await freshCart(untracked, 2);
    await run(cartService.mergeGuestCart(orgId, guest, buyer));
    const view = await run(cartService.view({ organizationId: orgId, userId: buyer }, 'fr'));
    expect(view.lines.map((l) => [l.sku, l.quantity])).toEqual([[`${t}-EBOOK`, 2]]);
    expect((await db.select().from(carts).where(eq(carts.id, guest)))).toHaveLength(0);
  });
});

describe('boutique : commande et paiement', () => {
  it('valide la saisie (tous les champs fautifs) avant toute écriture', async () => {
    const cartId = await freshCart(untracked, 1);
    const error = await failure(createOrder({ organizationId: orgId, cartId, userId: null, locale: 'fr', input: { ...address, email: 'x', postcode: '', shippingMethod: 'teleport' } }));
    expect(error?._tag).toBe('InvalidCheckoutError');
    expect(error?.fields).toEqual(['email', 'postcode', 'shippingMethod']);
  });

  it('n’ouvre pas le panier d’un utilisateur à un invité', async () => {
    const userCart = (await run(cartService.view({ organizationId: orgId, userId: buyer }, 'fr'))).cart!.id;
    expect((await failure(createOrder({ organizationId: orgId, cartId: userCart, userId: null, locale: 'fr', input: address })))?.code).toBe('NOT_FOUND');
  });

  it('crée la commande (prix TTC serveur, TVA, numéro sans trou), réserve le stock et vide le panier', async () => {
    const cartId = await freshCart(tracked, 2);
    const { order, url, accessToken } = await run(checkoutOrder({ organizationId: orgId, cartId, userId: null, locale: 'fr', input: address }, urls));
    expect(url).toContain('mock');
    expect(accessToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    // 2 × 24,00 + 5,90 de port, TTC à 20 % (prix catalogue TTC vendeur FR).
    expect(order).toMatchObject({ status: 'PENDING_PAYMENT', email: 'client@test.local', country: 'FR', grossMinor: 5390, currency: 'EUR', taxTreatment: 'domestic', taxCountry: 'FR' });
    expect(order.netMinor + order.taxMinor).toBe(order.grossMinor);
    expect(order.number).toMatch(/^CMD-\d{4}-\d{6}$/);
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    expect(lines.map((l) => [l.sku, l.quantity, l.lineTotalMinor])).toEqual([[`${t}-TEE`, 2, 4800]]);
    expect((await run(cartService.view({ organizationId: orgId, cartId }, 'fr'))).lines).toHaveLength(0);
    const reservations = await db.select().from(logisticsStockReservations).where(eq(logisticsStockReservations.reference, reservationReference(order.id)));
    expect(reservations.map((r) => [r.quantity, r.status])).toEqual([[2, 'active']]);
    // Stock réservé : disponible 3, mais le niveau physique reste 5 jusqu'au paiement.
    expect(await level()).toBe(5);
    const other = await freshCart(tracked, 4);
    const short = await failure(createOrder({ organizationId: orgId, cartId: other, userId: null, locale: 'fr', input: address }));
    expect(short).toMatchObject({ _tag: 'OutOfStockError', sku: `${t}-TEE` });
    // Échec : rien n'est écrit, le panier est intact.
    expect((await run(cartService.view({ organizationId: orgId, cartId: other }, 'fr'))).lines).toHaveLength(1);
    await run(cartService.setQuantity({ organizationId: orgId, cartId: other }, (await run(cartService.view({ organizationId: orgId, cartId: other }, 'fr'))).lines[0]!.lineId, 0));

    // Webhook payé → PAID, stock sorti, réservation consommée ; doublon sans effet.
    const paymentId = (await reload(order.id)).paymentId!;
    await webhook('succeeded', paymentId, 5390);
    await webhook('succeeded', paymentId, 5390);
    const paid = await reload(order.id);
    expect(paid).toMatchObject({ status: 'PAID', stockShortage: null });
    expect(paid.paidAt).toBeInstanceOf(Date);
    expect(await level()).toBe(3);
    expect((await db.select().from(logisticsStockReservations).where(eq(logisticsStockReservations.reference, reservationReference(order.id))))[0]!.status).toBe('consumed');

    // Administration : SHIPPED puis DELIVERED ; transitions système refusées ; autre tenant invisible.
    expect((await failure(orderService.transition(order.id, orgId, 'PAID')))?.code).toBe('FORBIDDEN');
    expect((await failure(orderService.transition(order.id, otherOrg, 'SHIPPED')))?.code).toBe('NOT_FOUND');
    expect((await run(orderService.transition(order.id, orgId, 'SHIPPED'))).shippedAt).toBeInstanceOf(Date);
    expect((await failure(orderService.transition(order.id, orgId, 'CANCELLED')))?.code).toBe('CONFLICT');
    expect((await run(orderService.transition(order.id, orgId, 'DELIVERED'))).status).toBe('DELIVERED');
    // Remboursement total (core/refunds, mock) : commande REFUNDED ; livrée → pas de remise en stock automatique.
    const refund = await run(requestRefund({ paymentId, organizationId: orgId, requestedBy: author }));
    expect(refund).toMatchObject({ status: 'succeeded', amount: 5390, currency: 'EUR' });
    expect((await reload(order.id)).status).toBe('REFUNDED');
    expect((await db.select({ status: payments.status }).from(payments).where(eq(payments.id, paymentId)))[0]!.status).toBe('refunded');
    expect(await level()).toBe(3);
  });

  it('expiration du paiement → EXPIRED et stock libéré ; paiement tardif acquis avec manque consigné', async () => {
    const cartId = await freshCart(tracked, 3);
    const { order } = await run(checkoutOrder({ organizationId: orgId, cartId, userId: null, locale: 'fr', input: address }, urls));
    const paymentId = (await reload(order.id)).paymentId!;
    await webhook('expired', paymentId, null);
    expect((await reload(order.id)).status).toBe('EXPIRED');
    expect((await db.select().from(logisticsStockReservations).where(eq(logisticsStockReservations.reference, reservationReference(order.id))))[0]!.status).toBe('released');
    // Le stock libéré est vendu ailleurs, puis le paiement tardif arrive.
    await run(logisticsService.recordMovement({ organizationId: orgId, warehouseId, sku: `${t}-TEE`, kind: 'issue', quantity: 2 }, author));
    await db.update(payments).set({ status: 'pending' }).where(eq(payments.id, paymentId));
    await webhook('succeeded', paymentId, order.grossMinor);
    const late = await reload(order.id);
    expect(late.status).toBe('PAID');
    expect(late.stockShortage).toBe(`${t}-TEE`.toUpperCase()); // SKU logistique (normalisé en majuscules)
    expect(await level()).toBe(1);
  });

  it('annulation admin d’une commande en attente : stock libéré ; balayage des commandes échues', async () => {
    const cartId = await freshCart(tracked, 1);
    const { order } = await run(checkoutOrder({ organizationId: orgId, cartId, userId: null, locale: 'fr', input: address }, urls));
    expect((await run(orderService.transition(order.id, orgId, 'CANCELLED'))).status).toBe('CANCELLED');
    expect((await db.select().from(logisticsStockReservations).where(eq(logisticsStockReservations.reference, reservationReference(order.id))))[0]!.status).toBe('released');

    const second = await freshCart(untracked, 1);
    const pending = await run(createOrder({ organizationId: orgId, cartId: second, userId: null, locale: 'fr', input: { ...address, shippingMethod: 'pickup' } }));
    expect(pending.shippingMinor).toBe(0);
    expect(await run(sweepShopOrders(new Date(pending.expiresAt.getTime() + 11 * 60_000)))).toBeGreaterThanOrEqual(1);
    expect((await reload(pending.id)).status).toBe('EXPIRED');
  });

  it('liste admin filtrée par statut et recherche, isolée par tenant', async () => {
    const all = await run(orderService.list(orgId, {}));
    expect(all.total).toBeGreaterThanOrEqual(4);
    const expired = await run(orderService.list(orgId, { status: 'EXPIRED' }));
    expect(expired.rows.every((o) => o.status === 'EXPIRED')).toBe(true);
    const first = all.rows[0]!;
    expect((await run(orderService.list(orgId, { search: first.number }))).rows.map((o) => o.id)).toEqual([first.id]);
    expect((await run(orderService.list(orgId, { search: '%' }))).total).toBe(0);
    expect((await run(orderService.list(otherOrg, {}))).total).toBe(0);
    expect(await run(orderService.byId(first.id, otherOrg))).toBeNull();
  });

  it('export hors UE : pas de TVA, le client paie le hors taxe', async () => {
    const cartId = await freshCart(untracked, 1);
    const order = await run(createOrder({ organizationId: orgId, cartId, userId: null, locale: 'en', input: { ...address, country: 'CH', postcode: '1200', city: 'Genève' } }));
    // 12,00 + 24,90 TTC FR → HT 10,00 + 20,75 ; pas de TVA à l'export.
    expect(order).toMatchObject({ taxTreatment: 'export', taxMinor: 0, grossMinor: 1000 + 2075, netMinor: 3075 });
  });
});
