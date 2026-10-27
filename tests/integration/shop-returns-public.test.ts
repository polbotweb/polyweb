/**
 * Boutique — demande de retour publique (page de suivi, lien signé) sur base réelle, sans
 * fournisseur de paiement : lien invalide, commande non livrée, saisie refusée, demande
 * acceptée et auditée, plafond de fréquence par commande.
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
import { and, eq, inArray } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { auditLog, cartLines, carts, orderLines, orders, products, productVariants } from '@database/schemas';
import { appRuntime } from '@/lib/effect/runtime';
import { AppConfig } from '@/lib/effect/config';
import { cartService } from '@/modules/shop/services/cart.service';
import { createOrder } from '@/modules/shop/services/order.service';
import { orderAccessToken } from '@/modules/shop/domain/cart-token';
import { publicOrderReturns, requestOrderReturn, returnQuantitiesOf, type ReturnSubmission } from '@/modules/shop/public/flow';
import { orderReturns } from '@/modules/shop/schema/returns';

const db = getDrizzle();
const t = `rmapub-${Date.now().toString(36)}`;
const email = `${t}@test.local`;
const run = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromise(e as Effect.Effect<A, E, never>);
const failTag = async <A, E>(e: Effect.Effect<A, E, any>) => {
  const exit = await appRuntime.runPromiseExit(e as Effect.Effect<A, E, never>);
  if (Exit.isSuccess(exit)) return null;
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return (reason as { error: { _tag: string } } | undefined)?.error._tag ?? null;
};
const meta = { ip: '203.0.113.7', userAgent: 'vitest', locale: 'fr' as const };

let productId = '';
let variantId = '';
let secret = '';

/** Commande publique de deux unités ; livrée si demandé (statut posé directement, sans paiement). */
const publicOrder = async (deliver: boolean) => {
  const cart = await run(cartService.addItem({ organizationId: null }, variantId, 2));
  const order = await run(createOrder({
    organizationId: null, cartId: cart.id, userId: null, locale: 'fr',
    input: { email, customerName: 'Client Public', phone: '', addressLine1: '1 rue de la Paix', addressLine2: '', postcode: '75002', city: 'Paris', country: 'FR', shippingMethod: 'standard' },
  }));
  if (deliver) await db.update(orders).set({ status: 'DELIVERED' }).where(eq(orders.id, order.id));
  const [line] = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  return { id: order.id, token: orderAccessToken(order.id, secret), status: deliver ? 'DELIVERED' as const : order.status, lineId: line!.id };
};
const submission = (lineId: string, qty: string, reason = 'damaged'): ReturnSubmission => ({ reason, note: '  Colis abîmé  ', quantities: { [lineId]: qty } });

beforeAll(async () => {
  secret = await run(Effect.gen(function* () { return (yield* AppConfig).signingSecret; }));
  const [p] = await db.insert(products).values({ organizationId: null, slug: t, title: `Produit ${t}`, status: 'PUBLISHED', publishedAt: new Date() }).returning();
  productId = p!.id;
  const [v] = await db.insert(productVariants).values({ productId, sku: t.toUpperCase(), position: 1, priceMinor: 2400, currency: 'EUR' }).returning();
  variantId = v!.id;
});

afterAll(async () => {
  const oids = (await db.select({ id: orders.id }).from(orders).where(eq(orders.email, email))).map((r) => r.id);
  if (oids.length) {
    const rids = (await db.select({ id: orderReturns.id }).from(orderReturns).where(inArray(orderReturns.orderId, oids))).map((r) => r.id);
    if (rids.length) await db.delete(auditLog).where(and(eq(auditLog.action, 'SHOP_RETURN_REQUEST'), inArray(auditLog.resourceId, rids)));
    await db.delete(orders).where(inArray(orders.id, oids));
  }
  const cids = (await db.select({ id: cartLines.cartId }).from(cartLines).where(eq(cartLines.variantId, variantId))).map((r) => r.id);
  if (cids.length) await db.delete(carts).where(inArray(carts.id, cids));
  await db.delete(products).where(eq(products.id, productId));
});

describe('Boutique — demande de retour publique', () => {
  it('lit les quantités qty:<ligne> du formulaire et ignore le reste', () => {
    expect(returnQuantitiesOf([['qty:a', '1'], ['reason', 'damaged'], ['qty:b', '']])).toEqual({ a: '1', b: '' });
  });

  it('refuse un lien de suivi altéré', async () => {
    const order = await publicOrder(true);
    expect(await failTag(requestOrderReturn(order.id, `${order.token}x`, submission(order.lineId, '1'), meta))).toBe('InvalidLink');
  });

  it("n'accepte pas de retour sur une commande non livrée", async () => {
    const order = await publicOrder(false);
    expect(await run(requestOrderReturn(order.id, order.token, submission(order.lineId, '1'), meta))).toEqual({ kind: 'notEligible' });
    expect((await run(publicOrderReturns(order))).open).toBe(false);
  });

  it('refuse un motif inconnu, une quantité non entière ou excessive, une demande vide', async () => {
    const order = await publicOrder(true);
    expect(await run(requestOrderReturn(order.id, order.token, submission(order.lineId, '1', 'whim'), meta))).toEqual({ kind: 'invalid', problem: 'empty' });
    expect(await run(requestOrderReturn(order.id, order.token, submission(order.lineId, '1.5'), meta))).toMatchObject({ kind: 'invalid' });
    expect(await run(requestOrderReturn(order.id, order.token, submission(order.lineId, '3'), meta))).toMatchObject({ kind: 'invalid' });
    expect(await run(requestOrderReturn(order.id, order.token, submission(order.lineId, ''), meta))).toMatchObject({ kind: 'invalid' });
    expect(await db.select().from(orderReturns).where(eq(orderReturns.orderId, order.id))).toHaveLength(0);
  });

  it('enregistre une demande valide, auditée, visible sur la page de suivi', async () => {
    const order = await publicOrder(true);
    const outcome = await run(requestOrderReturn(order.id, order.token, submission(order.lineId, '1'), meta));
    expect(outcome).toMatchObject({ kind: 'requested' });
    const [row] = await db.select().from(orderReturns).where(eq(orderReturns.orderId, order.id));
    expect(row).toMatchObject({ status: 'REQUESTED', reason: 'damaged', organizationId: null });
    expect(outcome.kind === 'requested' && outcome.number).toBe(row!.number);
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.action, 'SHOP_RETURN_REQUEST'), eq(auditLog.resourceId, row!.id)));
    expect(audits).toHaveLength(1);
    const view = await run(publicOrderReturns(order));
    expect(view.existing.map((r) => r.id)).toEqual([row!.id]);
    expect(view.returnable.find((e) => e.line.id === order.lineId)?.remaining).toBe(1);
    expect(view.open).toBe(true);
  });

  it('plafonne les demandes par commande (5 par quart d’heure)', async () => {
    const order = await publicOrder(true);
    for (let i = 0; i < 5; i++) {
      expect((await run(requestOrderReturn(order.id, order.token, submission(order.lineId, '1', 'whim'), meta))).kind).toBe('invalid');
    }
    expect(await run(requestOrderReturn(order.id, order.token, submission(order.lineId, '1'), meta))).toMatchObject({ kind: 'rateLimited' });
  });
});
