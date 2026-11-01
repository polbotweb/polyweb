/**
 * Portail client (base réelle) : rattachement par e-mail VÉRIFIÉ (création, vérification, backfill),
 * listes strictement limitées au compte, et IDOR — l'identifiant d'un autre client donne exactement
 * le même résultat qu'un identifiant inexistant (aucun jeton signé émis).
 */
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
import { organization, payments, sales, user } from '@database/schemas';
import { refunds } from '@database/schemas/refunds.schema';
import { appRuntime } from '@/lib/effect/runtime';
import { bookings, bookingsResources } from '@/modules/bookings/schema';
import { bookingsService } from '@/modules/bookings/services/bookings.service';
import { orders } from '@/modules/shop/schema/orders';
import { salesService, type SalesDocumentInput } from '@/modules/sales/services/salesDocument.service';
import { attachVerifiedRecords, backfillCustomerLinks, ownedBooking, ownedInvoice, ownedOrder, portalOverview, verifiedAccountIdFor } from '@/modules/portal/services/portal.service';
import { resolvePortalTarget } from '@/modules/portal/public/links';

const db = getDrizzle();
const run = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromise(e as Effect.Effect<A, E, never>);
const t = `portal-${Date.now().toString(36)}`;
const orgId = `${t}-org`;
const author = `${t}-author`;
const alice = `${t}-alice`;
const bob = `${t}-bob`;
const late = `${t}-late`;
const unverified = `${t}-unverified`;
const mail = (who: string) => `${who}@portal.test`;
const owner = { userId: author, sessionId: null };
const DAY = '2026-03-02';
const future = new Date(Date.now() + 86_400_000);
let resourceId = '';
let seq = 0;

const draft = (customerEmail: string | null): SalesDocumentInput => ({
  kind: 'invoice', organizationId: orgId, title: `${t} invoice ${seq++}`, customerName: 'Client', customerEmail,
  customerCountry: 'FR', customerType: 'B2C', sellerCountry: 'FR', supplyType: 'services', currency: 'EUR', paymentTermDays: 30,
  lines: [{ description: 'Prestation', quantity: '1', unitPriceMinor: 10000, taxCategory: 'standard' }],
});
const issuedInvoice = async (email: string | null) => {
  const doc = await run(salesService.create(draft(email), author, DAY));
  return run(salesService.transition(doc.id, 'ISSUED', owner, 'fr', DAY));
};
const order = async (email: string, userId: string | null = null) => (await db.insert(orders).values({
  organizationId: orgId, number: `${t}-CMD-${seq++}`, status: 'PAID', locale: 'fr', email, customerName: 'Client', addressLine1: '1 rue', userId,
  postcode: '75001', city: 'Paris', country: 'FR', shippingMethod: 'standard', shippingMinor: 0, currency: 'EUR', netMinor: 1000, taxMinor: 200, grossMinor: 1200,
  taxTreatment: 'domestic', taxBreakdown: [], expiresAt: future,
}).returning())[0]!;
const booking = async (email: string, customerUserId: string | null = null) => {
  const start = new Date(Date.UTC(2027, 0, 11, 8 + seq++ % 8));
  return (await db.insert(bookings).values({
    organizationId: orgId, resourceId, startsAt: start, endsAt: new Date(start.getTime() + 3_600_000), slug: `${t}-bk-${seq++}`, title: 'Résa',
    customerName: 'Client', customerEmail: email, partySize: 1, customerUserId,
  }).returning())[0]!;
};
const refundFor = async (reference: string, amount: number) => {
  const [payment] = await db.insert(payments).values({ organizationId: orgId, reference, provider: 'mock', status: 'paid', amount, currency: 'EUR', idempotencyKey: `${t}-pay-${seq++}` }).returning();
  await db.insert(refunds).values({ organizationId: orgId, paymentId: payment!.id, reference, provider: 'mock', amount, currency: 'EUR', idempotencyKey: `${t}-ref-${seq++}`, requestedBy: author });
};

beforeAll(async () => {
  await db.insert(user).values([
    { id: author, name: 'Author', email: mail(author), role: 'admin', emailVerified: true },
    { id: alice, name: 'Alice', email: mail(alice), emailVerified: true },
    { id: bob, name: 'Bob', email: mail(bob), emailVerified: true },
    { id: late, name: 'Late', email: mail(late), emailVerified: false },
    { id: unverified, name: 'Unverified', email: mail(unverified), emailVerified: false },
  ]);
  await db.insert(organization).values({ id: orgId, name: 'Portal org', slug: orgId, createdAt: new Date() });
  resourceId = (await run(bookingsService.createResource({ organizationId: orgId, code: `PRT${Date.now().toString(36).toUpperCase()}`, name: 'Salle portail', windows: [] }))).id;
});

afterAll(async () => {
  const pids = (await db.select({ id: payments.id }).from(payments).where(eq(payments.organizationId, orgId))).map((r) => r.id);
  if (pids.length) await db.delete(refunds).where(inArray(refunds.paymentId, pids));
  await db.delete(payments).where(eq(payments.organizationId, orgId));
  await db.delete(orders).where(eq(orders.organizationId, orgId));
  await db.delete(bookings).where(eq(bookings.organizationId, orgId));
  await db.delete(bookingsResources).where(eq(bookingsResources.organizationId, orgId));
  await db.delete(sales).where(eq(sales.organizationId, orgId));
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(inArray(user.id, [author, alice, bob, late, unverified]));
});

describe('portail client : rattachement', () => {
  it('compte vérifié trouvé sans tenir compte de la casse ; non vérifié → aucun', async () => {
    expect(await run(verifiedAccountIdFor(`  ${mail(alice).toUpperCase()} `))).toBe(alice);
    expect(await run(verifiedAccountIdFor(mail(unverified)))).toBeNull();
    expect(await run(verifiedAccountIdFor(null))).toBeNull();
  });

  it('facture créée/modifiée : propriétaire = compte vérifié de l’e-mail client, recalculé au changement', async () => {
    const doc = await run(salesService.create(draft(mail(alice).toUpperCase()), author, DAY));
    expect(doc.customerUserId).toBe(alice);
    const moved = await run(salesService.update(doc.id, { customerEmail: mail(unverified) }, owner, 'fr', DAY));
    expect(moved.customerUserId).toBeNull();
    const back = await run(salesService.update(doc.id, { customerEmail: mail(bob) }, owner, 'fr', DAY));
    expect(back.customerUserId).toBe(bob);
  });

  it("e-mail non vérifié : rien n'est rattaché ; après vérification : rattachement idempotent", async () => {
    const inv = await issuedInvoice(mail(late));
    const ord = await order(mail(late).toUpperCase());
    const bk = await booking(` ${mail(late)}`);
    expect(inv.customerUserId).toBeNull();
    expect(await run(attachVerifiedRecords(late))).toEqual({ invoices: 0, bookings: 0, orders: 0 });
    expect(await run(portalOverview(late))).toMatchObject({ invoices: [], orders: [], bookings: [] });

    await db.update(user).set({ emailVerified: true }).where(eq(user.id, late));
    expect(await run(attachVerifiedRecords(late))).toEqual({ invoices: 1, bookings: 1, orders: 1 });
    expect(await run(attachVerifiedRecords(late))).toEqual({ invoices: 0, bookings: 0, orders: 0 });
    const overview = await run(portalOverview(late));
    expect(overview.invoices.map((i) => i.id)).toEqual([inv.id]);
    expect(overview.orders.map((o) => o.id)).toEqual([ord.id]);
    expect(overview.bookings.map((b) => b.id)).toEqual([bk.id]);
  });

  it('ne réattribue jamais un enregistrement déjà possédé', async () => {
    const ord = await order(mail(alice), bob);
    await run(attachVerifiedRecords(alice));
    expect((await db.select().from(orders).where(eq(orders.id, ord.id)))[0]!.userId).toBe(bob);
  });

  it('backfill : rattache les orphelins des comptes vérifiés, ignore les non vérifiés', async () => {
    const mine = await booking(mail(alice).toUpperCase());
    const orphan = await booking(mail(unverified));
    const result = await run(backfillCustomerLinks());
    expect(result.bookings).toBeGreaterThanOrEqual(1);
    const rows = new Map((await db.select().from(bookings).where(inArray(bookings.id, [mine.id, orphan.id]))).map((r) => [r.id, r.customerUserId]));
    expect(rows.get(mine.id)).toBe(alice);
    expect(rows.get(orphan.id)).toBeNull();
  });
});

describe('portail client : IDOR', () => {
  it('listes limitées au compte (factures émises seulement, remboursements des paiements possédés)', async () => {
    const aliceInv = await issuedInvoice(mail(alice));
    const aliceDraft = await run(salesService.create(draft(mail(alice)), author, DAY));
    const bobInv = await issuedInvoice(mail(bob));
    const aliceOrder = await order(mail(alice), alice);
    await refundFor(`sales-invoice:${aliceInv.id}`, 300);
    await refundFor(`sales-invoice:${bobInv.id}`, 400);
    await refundFor(`shop-order:${aliceOrder.id}`, 500);

    const a = await run(portalOverview(alice));
    expect(a.invoices.map((i) => i.id)).toContain(aliceInv.id);
    expect(a.invoices.map((i) => i.id)).not.toContain(aliceDraft.id);
    expect(a.invoices.map((i) => i.id)).not.toContain(bobInv.id);
    expect(a.refunds.map((r) => r.amount).sort()).toEqual([300, 500]);
    const b = await run(portalOverview(bob));
    expect(b.invoices.map((i) => i.id)).toEqual([bobInv.id]);
    expect(b.refunds.map((r) => r.amount)).toEqual([400]);
    expect(b.orders.map((o) => o.id)).not.toContain(aliceOrder.id);
  });

  it("l'identifiant d'autrui ≡ inexistant : aucun accès, aucun lien signé", async () => {
    const bobInv = await issuedInvoice(mail(bob));
    const bobOrder = await order(mail(bob), bob);
    const bobBooking = await booking(mail(bob), bob);
    const aliceDraft = await run(salesService.create(draft(mail(alice)), author, DAY));

    expect(await run(ownedInvoice(alice, bobInv.id))).toBeNull();
    expect(await run(ownedInvoice(alice, aliceDraft.id))).toBeNull();
    expect(await run(ownedOrder(alice, bobOrder.id))).toBeNull();
    expect(await run(ownedBooking(alice, bobBooking.id))).toBeNull();
    expect(await run(ownedInvoice(alice, 'does-not-exist'))).toBeNull();
    for (const [target, id] of [['invoice-pay', bobInv.id], ['order', bobOrder.id], ['booking', bobBooking.id]] as const) {
      expect(await run(resolvePortalTarget(alice, target, id, 'fr'))).toBeNull();
    }

    expect(await run(ownedInvoice(bob, bobInv.id))).toMatchObject({ id: bobInv.id });
    expect(await run(resolvePortalTarget(bob, 'invoice-pay', bobInv.id, 'fr'))).toMatch(new RegExp(`/fr/.*${bobInv.id}.*t=`));
    expect(await run(resolvePortalTarget(bob, 'order', bobOrder.id, 'fr'))).toMatch(new RegExp(`^/fr/shop/order/${bobOrder.id}\\?t=`));
    expect(await run(resolvePortalTarget(bob, 'booking', bobBooking.id, 'fr'))).toContain('t=');
  });

  it('réservation publique par un client connecté : rattachée à son compte', async () => {
    const resource = await run(bookingsService.createResource({ organizationId: orgId, code: `PRTB${Date.now().toString(36).toUpperCase()}`, name: 'Créneaux', capacity: 2, timezone: 'UTC', slotMinutes: 60, windows: [{ weekday: 1, start: '09:00', end: '12:00' }] }));
    const now = new Date('2027-01-04T12:00:00Z');
    const { booking: created } = await run(bookingsService.createGuestBooking({
      organizationId: orgId, resourceId: resource.id, startsAt: '2027-01-11T09:00:00.000Z', customerName: 'Alice', customerEmail: mail(alice), customerPhone: null, partySize: 1, notes: null, requireDeposit: false, customerUserId: alice,
    }, now));
    expect(created.customerUserId).toBe(alice);
    expect(await run(ownedBooking(bob, created.id))).toBeNull();
  });
});
