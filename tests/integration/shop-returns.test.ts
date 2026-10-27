/**
 * Boutique — retours clients (RMA) sur base réelle, fournisseur de paiement mock uniquement
 * (aucun appel Stripe) : demande plafonnée et concurrente, workflow admin, inspection avec
 * remise en stock Logistics (grand livre), remboursement core/refunds idempotent, reprise après
 * échec, confirmation par webhook, cloisonnement par tenant.
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
import { and, eq, inArray, like } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { organization, payments, user, products, productVariants, orders, orderLines, carts, logisticsStockMovements } from '@database/schemas';
import { paymentEvents } from '@database/schemas/payments.schema';
import { refunds } from '@database/schemas/refunds.schema';
import { registerRefundsCore, requestRefund } from '@/core/refunds';
import { appRuntime } from '@/lib/effect/runtime';
import {
  gatewayOf, handleWebhook, makeMockProvider, MOCK_REFUND_DECLINED_MINOR, MOCK_REFUND_PENDING_MINOR, MOCK_SIGNATURE_HEADER, mockWebhookBody,
  PaymentGateway, signMockPayload, type VerifiedPaymentEvent,
} from '@/core/payments';
import { logisticsService } from '@/modules/logistics/services/logistics.service';
import { logisticsLoader } from '@/modules/logistics/loaders';
import { cartService } from '@/modules/shop/services/cart.service';
import { checkoutOrder, orderService } from '@/modules/shop/services/order.service';
import { returnService } from '@/modules/shop/services/return.service';
import { registerShopPayments } from '@/modules/shop/payments';
import { registerShopRefunds } from '@/modules/shop/refunds';
import { orderReturnLines, orderReturns } from '@/modules/shop/schema/returns';
import type { CheckoutInput } from '@/modules/shop/domain/checkout';

const SECRET = 'itest-mock-secret';
const db = getDrizzle();
const t = `rma-${Date.now().toString(36)}`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const author = `${t}-author`;
const provider = makeMockProvider(SECRET);
const run = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromise(Effect.provideService(e, PaymentGateway, gatewayOf(provider)) as Effect.Effect<A, E, never>);
const failure = async <A, E>(e: Effect.Effect<A, E, any>) => {
  const exit = await appRuntime.runPromiseExit(Effect.provideService(e, PaymentGateway, gatewayOf(provider)) as Effect.Effect<A, E, never>);
  if (Exit.isSuccess(exit)) throw new Error('succès inattendu');
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return (reason as { error: { _tag: string; code?: string; message?: string } & Record<string, unknown> } | undefined)?.error;
};
const urls = { successUrl: 'https://example.test/ok', cancelUrl: 'https://example.test/ko' };

let seq = 0;
const webhook = (event: Omit<VerifiedPaymentEvent, 'provider' | 'eventId'>) => {
  const body = mockWebhookBody({ ...event, eventId: `evt_${t}_${seq++}` });
  return run(handleWebhook(body, new Headers({ [MOCK_SIGNATURE_HEADER]: signMockPayload(body, SECRET) })));
};

const address: CheckoutInput = {
  email: 'client@test.local', customerName: 'Client Retour', phone: '', addressLine1: '1 rue de la Paix', addressLine2: '',
  postcode: '75002', city: 'Paris', country: 'fr', shippingMethod: 'standard',
};

let warehouseId = '';
let tee = '';
let ebook = '';
let pendingItem = '';
let declinedItem = '';

const level = async () => (await run(logisticsLoader.stockLevels(orgId, warehouseId))).find((row) => row.sku === `${t}-TEE`.toUpperCase())?.level ?? 0;
const product = async (sku: string, priceMinor: number) => {
  const [p] = await db.insert(products).values({ organizationId: orgId, slug: sku.toLowerCase(), title: `Produit ${sku}`, status: 'PUBLISHED' }).returning();
  const [v] = await db.insert(productVariants).values({ productId: p!.id, sku, position: 1, priceMinor, currency: 'EUR' }).returning();
  return v!.id;
};

/** Commande payée (webhook mock), expédiée puis livrée. */
const deliveredOrder = async (items: readonly [string, number][], deliver = true) => {
  let cartId: string | undefined;
  for (const [variantId, quantity] of items) cartId = (await run(cartService.addItem({ organizationId: orgId, cartId }, variantId, quantity))).id;
  const { order } = await run(checkoutOrder({ organizationId: orgId, cartId: cartId!, userId: null, locale: 'fr', input: address }, () => urls));
  const paymentId = (await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.paymentId!;
  await webhook({ type: 'mock.succeeded', kind: 'succeeded', paymentId, providerPaymentId: `mock_pi_${paymentId}`, sessionId: null, amount: { amountMinor: order.grossMinor, currency: 'EUR' } });
  if (deliver) {
    await run(orderService.transition(order.id, orgId, 'SHIPPED'));
    await run(orderService.transition(order.id, orgId, 'DELIVERED'));
  }
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  const line = (variantId: string) => lines.find((l) => l.variantId === variantId)!;
  return { order, paymentId, lines, line };
};

/** Retour demandé, approuvé et réceptionné. */
const receivedReturn = async (orderId: string, lines: { orderLineId: string; quantity: number }[]) => {
  const rma = await run(returnService.request({ orderId, organizationId: orgId, reason: 'defective', lines }));
  await run(returnService.approve(rma.id, orgId, author));
  await run(returnService.receive(rma.id, orgId, author));
  const returnLines = await db.select().from(orderReturnLines).where(eq(orderReturnLines.returnId, rma.id));
  return { rma, returnLines };
};
const returnRow = async (id: string) => (await db.select().from(orderReturns).where(eq(orderReturns.id, id)))[0]!;

beforeAll(async () => {
  await db.insert(user).values({ id: author, name: 'RMA author', email: `${author}@test.local`, role: 'admin' });
  await db.insert(organization).values([{ id: orgId, name: 'RMA org', slug: orgId, createdAt: new Date() }, { id: otherOrg, name: 'RMA other', slug: otherOrg, createdAt: new Date() }]);
  tee = await product(`${t}-TEE`, 2400);
  ebook = await product(`${t}-EBOOK`, 1200);
  pendingItem = await product(`${t}-PEN`, MOCK_REFUND_PENDING_MINOR);
  declinedItem = await product(`${t}-DEC`, MOCK_REFUND_DECLINED_MINOR);
  warehouseId = (await run(logisticsService.createWarehouse({ organizationId: orgId, code: 'SHOP', name: 'Boutique' }))).id;
  await run(logisticsService.createItem({ organizationId: orgId, sku: `${t}-TEE`, name: 'T-shirt', variantId: tee }));
  await run(logisticsService.recordMovement({ organizationId: orgId, warehouseId, sku: `${t}-TEE`, kind: 'receipt', quantity: 10 }, author));
  registerShopPayments();
  registerRefundsCore();
  registerShopRefunds();
});

afterAll(async () => {
  const pids = (await db.select({ id: payments.id }).from(payments).where(inArray(payments.organizationId, [orgId, otherOrg]))).map((r) => r.id);
  await db.delete(orderReturns).where(inArray(orderReturns.organizationId, [orgId, otherOrg]));
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
  await db.delete(user).where(eq(user.id, author));
});

describe('boutique : demande de retour', () => {
  it('commande livrée uniquement, quantités plafonnées, ligne d’une autre commande refusée, numéro RMA', async () => {
    const paidOnly = await deliveredOrder([[ebook, 1]], false);
    expect((await failure(returnService.request({ orderId: paidOnly.order.id, organizationId: orgId, reason: 'other', lines: [{ orderLineId: paidOnly.line(ebook).id, quantity: 1 }] })))?.code).toBe('CONFLICT');

    const small = await deliveredOrder([[ebook, 1]]);
    const { order, line } = await deliveredOrder([[tee, 2], [ebook, 1]]);
    const ask = (requested: { orderLineId: string; quantity: number }[], organizationId: string | null = orgId) =>
      returnService.request({ orderId: order.id, organizationId, reason: 'damaged', note: '  Colis abîmé  ', lines: requested });
    expect(await failure(ask([]))).toMatchObject({ code: 'BAD_REQUEST', message: 'empty' });
    expect(await failure(ask([{ orderLineId: line(tee).id, quantity: 3 }]))).toMatchObject({ code: 'BAD_REQUEST', message: 'quantity' });
    expect(await failure(ask([{ orderLineId: small.line(ebook).id, quantity: 1 }]))).toMatchObject({ code: 'BAD_REQUEST', message: 'unknownLine' });
    expect(await failure(ask([{ orderLineId: line(tee).id, quantity: 1 }, { orderLineId: line(tee).id, quantity: 1 }]))).toMatchObject({ code: 'BAD_REQUEST', message: 'duplicate' });
    expect((await failure(ask([{ orderLineId: line(tee).id, quantity: 1 }], otherOrg)))?.code).toBe('NOT_FOUND');

    const rma = await run(ask([{ orderLineId: line(tee).id, quantity: 1 }, { orderLineId: line(ebook).id, quantity: 0 }]));
    expect(rma).toMatchObject({ status: 'REQUESTED', reason: 'damaged', customerNote: 'Colis abîmé', currency: 'EUR', organizationId: orgId });
    expect(rma.number).toMatch(/^RMA-\d{4}-\d{5}$/);
    expect(await db.select({ q: orderReturnLines.quantity }).from(orderReturnLines).where(eq(orderReturnLines.returnId, rma.id))).toEqual([{ q: 1 }]);
    expect((await run(returnService.returnable(order.id))).map((r) => [r.line.variantId, r.remaining])).toEqual([[tee, 1], [ebook, 1]]);

    // Deux demandes concurrentes sur le dernier article : une seule passe (verrou commande).
    const racing = await Promise.all([1, 2].map(() => appRuntime.runPromiseExit(ask([{ orderLineId: line(tee).id, quantity: 1 }]) as Effect.Effect<unknown, unknown, never>)));
    expect(racing.filter(Exit.isSuccess)).toHaveLength(1);
    expect((await run(returnService.returnable(order.id))).find((r) => r.line.variantId === tee)?.remaining).toBe(0);

    // Annulé ou refusé : les quantités redeviennent retournables.
    await run(returnService.cancel(rma.id, orgId));
    const rejected = (await run(returnService.forOrder(order.id))).find((r) => r.status === 'REQUESTED')!;
    expect(await run(returnService.reject(rejected.id, orgId, 'Hors délai'))).toMatchObject({ status: 'REJECTED', adminNote: 'Hors délai' });
    expect((await run(returnService.returnable(order.id))).find((r) => r.line.variantId === tee)?.remaining).toBe(2);
    expect((await failure(returnService.approve(rma.id, orgId, author)))?.code).toBe('CONFLICT');
  });
});

describe('boutique : traitement du retour', () => {
  it('workflow ordonné, inspection validée, remise en stock au grand livre puis remboursement idempotent', async () => {
    const { order, paymentId, line } = await deliveredOrder([[tee, 3], [ebook, 1]]);
    const rma = await run(returnService.request({ orderId: order.id, organizationId: orgId, reason: 'defective', lines: [{ orderLineId: line(tee).id, quantity: 2 }, { orderLineId: line(ebook).id, quantity: 1 }] }));
    expect((await failure(returnService.receive(rma.id, orgId, author)))?.code).toBe('CONFLICT');
    expect((await failure(returnService.approve(rma.id, otherOrg, author)))?.code).toBe('NOT_FOUND');
    expect(await run(returnService.approve(rma.id, orgId, author))).toMatchObject({ status: 'APPROVED', approvedBy: author });
    expect((await failure(returnService.inspect(rma.id, orgId, author, { lines: [] })))?.code).toBe('CONFLICT');
    expect(await run(returnService.receive(rma.id, orgId, author))).toMatchObject({ status: 'RECEIVED', receivedBy: author });

    const returnLines = await db.select().from(orderReturnLines).where(eq(orderReturnLines.returnId, rma.id));
    const teeLine = returnLines.find((l) => l.orderLineId === line(tee).id)!;
    const ebookLine = returnLines.find((l) => l.orderLineId === line(ebook).id)!;
    expect((await failure(returnService.inspect(rma.id, orgId, author, { lines: [{ lineId: teeLine.id, accepted: 1, restocked: 2 }] })))).toMatchObject({ code: 'BAD_REQUEST', message: 'inspection' });
    expect((await failure(returnService.inspect(rma.id, orgId, author, { lines: [{ lineId: teeLine.id, accepted: 3, restocked: 0 }] })))?.message).toBe('inspection');
    expect((await failure(returnService.inspect(rma.id, orgId, author, { lines: [{ lineId: 'nope', accepted: 0, restocked: 0 }] })))?.message).toBe('inspection');
    // Aucun remboursement possible avant inspection.
    expect(await failure(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: { amountMinor: 100, currency: 'EUR' }, metadata: { restock: false, returnId: rma.id } })))
      .toMatchObject({ _tag: 'RefundNotAllowedError', reason: 'handler', detail: 'return' });

    const before = await level();
    const inspected = await run(returnService.inspect(rma.id, orgId, author, { lines: [{ lineId: teeLine.id, accepted: 2, restocked: 1 }, { lineId: ebookLine.id, accepted: 1, restocked: 0 }], note: 'Un t-shirt taché' }));
    expect(inspected.updated).toMatchObject({ status: 'INSPECTED', refundMinor: 2 * 2400 + 1200, inspectedBy: author, adminNote: 'Un t-shirt taché' });
    expect(inspected.restocked).toBe(1);
    expect(await level()).toBe(before + 1);
    const movements = await db.select().from(logisticsStockMovements).where(and(eq(logisticsStockMovements.organizationId, orgId), eq(logisticsStockMovements.reference, `RET-${order.number}`)));
    expect(movements.map((m) => [m.kind, m.delta, m.createdBy])).toEqual([['return', 1, author]]);
    expect((await db.select().from(orderReturnLines).where(eq(orderReturnLines.returnId, rma.id))).map((l) => [l.acceptedQuantity, l.restockedQuantity, l.condition]).sort())
      .toEqual([[1, 0, 'damaged'], [2, 1, 'damaged']]);

    const { refund, returnRow: refunded } = await run(returnService.refund(rma.id, orgId, author));
    expect(refund).toMatchObject({ status: 'succeeded', amount: 6000, reason: 'return', idempotencyKey: `rma:${rma.id}:0`, requestedBy: author });
    expect(refunded).toMatchObject({ status: 'REFUNDED', refundId: refund!.id });
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)))[0]!.status).toBe('partially_refunded');
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe('DELIVERED');
    // Rejeu : aucun second remboursement, aucun mouvement de stock supplémentaire.
    expect((await run(returnService.refund(rma.id, orgId, author))).refund).toBeNull();
    expect(await db.select().from(refunds).where(eq(refunds.paymentId, paymentId))).toHaveLength(1);
    expect(await level()).toBe(before + 1);
  });

  it('rien d’accepté : retour clos sans remboursement ni stock', async () => {
    const { order, line } = await deliveredOrder([[tee, 1]]);
    const { rma, returnLines } = await receivedReturn(order.id, [{ orderLineId: line(tee).id, quantity: 1 }]);
    const before = await level();
    const { updated } = await run(returnService.inspect(rma.id, orgId, author, { lines: [{ lineId: returnLines[0]!.id, accepted: 0, restocked: 0 }] }));
    expect(updated).toMatchObject({ status: 'CLOSED', refundMinor: 0 });
    expect(updated.closedAt).toBeInstanceOf(Date);
    expect(await level()).toBe(before);
    expect((await failure(returnService.refund(rma.id, orgId, author)))?.code).toBe('CONFLICT');
  });

  it('remboursement en attente confirmé par webhook → retour remboursé', async () => {
    const { order, paymentId, line } = await deliveredOrder([[pendingItem, 1]]);
    const { rma, returnLines } = await receivedReturn(order.id, [{ orderLineId: line(pendingItem).id, quantity: 1 }]);
    await run(returnService.inspect(rma.id, orgId, author, { lines: [{ lineId: returnLines[0]!.id, accepted: 1, restocked: 0 }] }));
    const { refund, returnRow: waiting } = await run(returnService.refund(rma.id, orgId, author));
    expect(refund).toMatchObject({ status: 'pending', amount: MOCK_REFUND_PENDING_MINOR });
    expect(waiting).toMatchObject({ status: 'INSPECTED', refundId: refund!.id });
    // Double clic pendant l'attente : même remboursement (même clé).
    expect((await run(returnService.refund(rma.id, orgId, author))).refund!.id).toBe(refund!.id);
    await webhook({
      type: 'mock.refund.succeeded', kind: 'refund', paymentId, providerPaymentId: `mock_pi_${paymentId}`, sessionId: null, amount: { amountMinor: MOCK_REFUND_PENDING_MINOR, currency: 'EUR' },
      refund: { providerRefundId: `mock_re_${refund!.id}`, status: 'succeeded', refundId: refund!.id, amount: { amountMinor: MOCK_REFUND_PENDING_MINOR, currency: 'EUR' }, failureReason: null },
    });
    expect(await returnRow(rma.id)).toMatchObject({ status: 'REFUNDED', refundId: refund!.id });
  });

  it('refus du fournisseur : le retour reste inspecté, nouvelle tentative avec une nouvelle clé', async () => {
    const { order, line } = await deliveredOrder([[declinedItem, 1]]);
    const { rma, returnLines } = await receivedReturn(order.id, [{ orderLineId: line(declinedItem).id, quantity: 1 }]);
    await run(returnService.inspect(rma.id, orgId, author, { lines: [{ lineId: returnLines[0]!.id, accepted: 1, restocked: 0 }] }));
    const first = await run(returnService.refund(rma.id, orgId, author));
    expect(first.refund).toMatchObject({ status: 'failed', idempotencyKey: `rma:${rma.id}:0` });
    expect(first.returnRow).toMatchObject({ status: 'INSPECTED', refundId: first.refund!.id });
    const second = await run(returnService.refund(rma.id, orgId, author));
    expect(second.refund).toMatchObject({ status: 'failed', idempotencyKey: `rma:${rma.id}:1` });
    expect(await returnRow(rma.id)).toMatchObject({ status: 'INSPECTED', refundAttempts: 1, refundId: second.refund!.id });
  });

  it('liste admin filtrée et cloisonnée ; détail avec lignes et remboursement', async () => {
    const all = await run(returnService.list(orgId, {}));
    expect(all.total).toBeGreaterThanOrEqual(5);
    const refundedList = await run(returnService.list(orgId, { status: 'REFUNDED' }));
    expect(refundedList.rows.every((r) => r.returnRow.status === 'REFUNDED')).toBe(true);
    const one = refundedList.rows[0]!;
    expect((await run(returnService.list(orgId, { search: one.returnRow.number }))).rows.map((r) => r.returnRow.id)).toEqual([one.returnRow.id]);
    expect((await run(returnService.list(otherOrg, {}))).total).toBe(0);
    const detail = await run(returnService.byId(one.returnRow.id, orgId));
    expect(detail?.order.number).toBe(one.orderNumber);
    expect(detail?.refund?.status).toBe('succeeded');
    expect(detail!.lines.length).toBeGreaterThan(0);
    expect(await run(returnService.byId(one.returnRow.id, otherOrg))).toBeNull();
  });
});
