/**
 * core/refunds sur base réelle (fournisseur mock uniquement, aucun appel Stripe) : remboursements
 * total / partiel plafonnés, idempotence, refus définitif / réponse en attente, webhooks
 * (succès, échec, doublon, remboursement externe), reprise cron, réactions Sales et Bookings.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Passerelle de l'application (formulaire admin) : fournisseur mock, jamais Stripe.
vi.hoisted(() => {
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.PAYMENT_PROVIDER = 'mock';
  process.env.PAYMENTS_MOCK_SECRET = 'itest-mock-secret';
});

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
import { organization, payments, sales, salesPayments, user } from '@database/schemas';
import { paymentEvents } from '@database/schemas/payments.schema';
import { refunds } from '@database/schemas/refunds.schema';
import { appRuntime } from '@/lib/effect/runtime';
import {
  gatewayOf, handleWebhook, makeMockProvider, MOCK_REFUND_DECLINED_MINOR, MOCK_REFUND_PENDING_MINOR, MOCK_SIGNATURE_HEADER, mockWebhookBody,
  PaymentGateway, registerPaymentPurpose, signMockPayload, startCheckout, type VerifiedPaymentEvent,
} from '@/core/payments';
import {
  listRefunds, refundablePaymentsFor, refundsForPayment, registerRefundHandler, registerRefundsCore, requestRefund, resumeStaleRefunds, RefundNotAllowedError,
  type RefundOutcome,
} from '@/core/refunds';
import { salesService, type SalesDocumentInput } from '@/modules/sales/services/salesDocument.service';
import { registerSalesPayments, startInvoiceCheckout } from '@/modules/sales/payments';
import { registerSalesRefunds } from '@/modules/sales/refunds';
import { bookings, bookingsResources } from '@/modules/bookings/schema';
import { bookingsService } from '@/modules/bookings/services/bookings.service';
import { registerBookingPayments, startDepositCheckout } from '@/modules/bookings/payments';
import { registerBookingRefunds } from '@/modules/bookings/refunds';
import { handleRefundPost, refundPanelView } from '@/core/refunds/admin';

const SECRET = 'itest-mock-secret';
const db = getDrizzle();
const t = `rf-${Date.now().toString(36)}`;
const orgId = `${t}-org`;
const otherOrg = `${t}-other`;
const author = `${t}-author`;
const member = `${t}-member`;
const owner = { userId: author, sessionId: null };
const PURPOSE = 'itestrf';
const provider = makeMockProvider(SECRET);
const run = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromise(Effect.provideService(e, PaymentGateway, gatewayOf(provider)) as Effect.Effect<A, E, never>);
const failure = async <A, E>(e: Effect.Effect<A, E, any>) => {
  const exit = await appRuntime.runPromiseExit(Effect.provideService(e, PaymentGateway, gatewayOf(provider)) as Effect.Effect<A, E, never>);
  if (Exit.isSuccess(exit)) throw new Error('succès inattendu');
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return (reason as { error: { _tag: string } & Record<string, unknown> } | undefined)?.error;
};
const urls = { successUrl: 'https://example.test/ok', cancelUrl: 'https://example.test/ko' };

let seq = 0;
const webhook = (event: Omit<VerifiedPaymentEvent, 'provider' | 'eventId'> & { eventId?: string }) => {
  const body = mockWebhookBody({ ...event, eventId: event.eventId ?? `evt_${t}_${seq++}` });
  return run(handleWebhook(body, new Headers({ [MOCK_SIGNATURE_HEADER]: signMockPayload(body, SECRET) })));
};
const paid = async (paymentId: string, amountMinor: number) =>
  webhook({ type: 'mock.succeeded', kind: 'succeeded', paymentId, providerPaymentId: `mock_pi_${paymentId}`, sessionId: null, amount: { amountMinor, currency: 'EUR' } });
const refundEvent = (paymentId: string, refund: NonNullable<VerifiedPaymentEvent['refund']>, eventId?: string) =>
  webhook({ eventId, type: `mock.refund.${refund.status}`, kind: 'refund', paymentId, providerPaymentId: `mock_pi_${paymentId}`, sessionId: null, amount: refund.amount, refund });
const eur = (amountMinor: number) => ({ amountMinor, currency: 'EUR' as const });
const paymentRow = async (id: string) => (await db.select().from(payments).where(eq(payments.id, id)))[0]!;

/** Paiement capturé d'un objet de test (`itestrf:<subject>`). */
const capturedPayment = async (subject: string, amountMinor = 2500) => {
  const { payment } = await run(startCheckout({ organizationId: orgId, purpose: PURPOSE, subjectId: `${t}-${subject}`, amount: eur(amountMinor), description: 'Test', ...urls }));
  await paid(payment.id, amountMinor);
  return payment.id;
};

const reactions: RefundOutcome[] = [];

beforeAll(async () => {
  await db.insert(user).values([{ id: author, name: 'Refund author', email: `${author}@test.local`, role: 'admin' }, { id: member, name: 'Plain user', email: `${member}@test.local`, role: 'user' }]);
  await db.insert(organization).values([{ id: orgId, name: 'Refund org', slug: orgId, createdAt: new Date() }, { id: otherOrg, name: 'Other org', slug: otherOrg, createdAt: new Date() }]);
  registerPaymentPurpose({ purpose: PURPOSE });
  registerRefundHandler({
    purpose: PURPOSE,
    validate: (_tx, input) => (input.subjectId.endsWith('-deny') ? Effect.fail(new RefundNotAllowedError({ paymentId: input.payment.id, reason: 'handler', detail: 'deny' })) : Effect.void),
    onSucceeded: (_tx, outcome) => Effect.sync(() => { reactions.push(outcome); }),
  });
  registerRefundsCore();
  registerSalesPayments();
  registerSalesRefunds();
  registerBookingPayments();
  registerBookingRefunds();
});

afterAll(async () => {
  const pids = (await db.select({ id: payments.id }).from(payments).where(inArray(payments.organizationId, [orgId, otherOrg]))).map((r) => r.id);
  if (pids.length) {
    await db.delete(refunds).where(inArray(refunds.paymentId, pids));
    await db.delete(paymentEvents).where(inArray(paymentEvents.paymentId, pids));
  }
  await db.delete(paymentEvents).where(like(paymentEvents.eventId, `evt_${t}_%`));
  await db.delete(payments).where(inArray(payments.organizationId, [orgId, otherOrg]));
  const docs = (await db.select({ id: sales.id }).from(sales).where(eq(sales.organizationId, orgId))).map((d) => d.id);
  if (docs.length) {
    await db.delete(salesPayments).where(inArray(salesPayments.documentId, docs));
    await db.update(sales).set({ sourceDocumentId: null }).where(inArray(sales.id, docs));
    await db.delete(sales).where(and(eq(sales.organizationId, orgId), inArray(sales.id, docs)));
  }
  await db.delete(bookings).where(eq(bookings.organizationId, orgId));
  await db.delete(bookingsResources).where(eq(bookingsResources.organizationId, orgId));
  await db.delete(organization).where(inArray(organization.id, [orgId, otherOrg]));
  await db.delete(user).where(inArray(user.id, [author, member]));
});

describe('core/refunds : demandes', () => {
  it('remboursement total par défaut : paiement `refunded`, réaction du module, plus rien à rembourser', async () => {
    const paymentId = await capturedPayment('full');
    const refund = await run(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, note: 'Client' }));
    expect(refund).toMatchObject({ status: 'succeeded', amount: 2500, currency: 'EUR', providerRefundId: `mock_re_${refund.id}`, requestedBy: author, reference: `${PURPOSE}:${t}-full` });
    expect(refund.succeededAt).toBeInstanceOf(Date);
    expect((await paymentRow(paymentId)).status).toBe('refunded');
    expect(reactions.find((r) => r.refund.id === refund.id)).toMatchObject({ subjectId: `${t}-full`, totalRefunded: 2500, fullyRefunded: true });
    expect((await failure(requestRefund({ paymentId, organizationId: orgId, requestedBy: author })))).toMatchObject({ _tag: 'RefundNotAllowedError', reason: 'status' });
  });

  it('partiels plafonnés au capturé, idempotence par clé, conflit si la demande diffère', async () => {
    const paymentId = await capturedPayment('partial');
    const first = await run(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: eur(1000), idempotencyKey: `${t}-k1` }));
    expect(first.status).toBe('succeeded');
    expect((await paymentRow(paymentId)).status).toBe('partially_refunded');
    expect((await run(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: eur(1000), idempotencyKey: `${t}-k1` }))).id).toBe(first.id);
    expect(await failure(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: eur(900), idempotencyKey: `${t}-k1` }))).toMatchObject({ _tag: 'RefundIdempotencyConflictError' });
    expect(await failure(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: eur(1501) }))).toMatchObject({ _tag: 'RefundAmountExceededError', requested: 1501, available: 1500 });
    expect(await failure(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: { amountMinor: 100, currency: 'USD' } }))).toMatchObject({ reason: 'currency' });
    expect(await failure(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: eur(0) }))).toMatchObject({ reason: 'amount' });
    const rest = await run(requestRefund({ paymentId, organizationId: orgId, requestedBy: author }));
    expect(rest.amount).toBe(1500);
    expect((await paymentRow(paymentId)).status).toBe('refunded');
    expect(reactions.filter((r) => r.payment.id === paymentId).map((r) => [r.totalRefunded, r.fullyRefunded])).toEqual([[1000, false], [2500, true]]);
    const [entry] = await run(refundablePaymentsFor(`${PURPOSE}:${t}-partial`));
    expect(entry?.summary).toMatchObject({ captured: 2500, refunded: 2500, pending: 0, remaining: 0 });
  });

  it('isolation par tenant, refus métier du module, paiement non capturé', async () => {
    const paymentId = await capturedPayment('tenant');
    expect(await failure(requestRefund({ paymentId, organizationId: otherOrg, requestedBy: author }))).toMatchObject({ _tag: 'RefundNotAllowedError', reason: 'not_found' });
    const denied = await capturedPayment('deny');
    expect(await failure(requestRefund({ paymentId: denied, organizationId: orgId, requestedBy: author }))).toMatchObject({ reason: 'handler', detail: 'deny' });
    expect(await run(refundsForPayment(denied))).toHaveLength(0);
    const { payment: unpaid } = await run(startCheckout({ organizationId: orgId, purpose: PURPOSE, subjectId: `${t}-unpaid`, amount: eur(500), description: 'Test', ...urls }));
    expect(await failure(requestRefund({ paymentId: unpaid.id, organizationId: orgId, requestedBy: author }))).toMatchObject({ reason: 'status' });
  });

  it('refus définitif du fournisseur → `failed`, le reste redevient remboursable', async () => {
    const paymentId = await capturedPayment('declined');
    const declined = await run(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: eur(MOCK_REFUND_DECLINED_MINOR) }));
    expect(declined).toMatchObject({ status: 'failed' });
    expect(declined.failureReason).toBeTruthy();
    expect((await paymentRow(paymentId)).status).toBe('paid');
    expect((await run(requestRefund({ paymentId, organizationId: orgId, requestedBy: author }))).amount).toBe(2500);
  });
});

describe('core/refunds : webhooks', () => {
  it('réponse en attente puis confirmation par webhook ; doublon ignoré ; en cours compté dans le plafond', async () => {
    const paymentId = await capturedPayment('pending');
    const pending = await run(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: eur(MOCK_REFUND_PENDING_MINOR) }));
    expect(pending).toMatchObject({ status: 'pending', providerRefundId: `mock_re_${pending.id}` });
    expect(await failure(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: eur(2500 - MOCK_REFUND_PENDING_MINOR + 1) }))).toMatchObject({ _tag: 'RefundAmountExceededError' });
    const event = { providerRefundId: `mock_re_${pending.id}`, status: 'succeeded' as const, refundId: pending.id, amount: eur(MOCK_REFUND_PENDING_MINOR), failureReason: null };
    const eventId = `evt_${t}_pending_ok`;
    expect(await refundEvent(paymentId, event, eventId)).toMatchObject({ status: 'refund', outcome: 'applied' });
    expect(await refundEvent(paymentId, event, eventId)).toMatchObject({ status: 'refund', outcome: 'duplicate' });
    expect(await refundEvent(paymentId, event)).toMatchObject({ outcome: 'unchanged' });
    expect((await run(refundsForPayment(paymentId)))[0]).toMatchObject({ status: 'succeeded' });
    expect((await paymentRow(paymentId)).status).toBe('partially_refunded');
  });

  it('échec signalé par webhook : `failed` avec motif, paiement inchangé', async () => {
    const paymentId = await capturedPayment('wh-failed');
    const pending = await run(requestRefund({ paymentId, organizationId: orgId, requestedBy: author, amount: eur(MOCK_REFUND_PENDING_MINOR) }));
    const result = await refundEvent(paymentId, { providerRefundId: `mock_re_${pending.id}`, status: 'failed', refundId: pending.id, amount: eur(MOCK_REFUND_PENDING_MINOR), failureReason: 'expired_or_canceled_card' });
    expect(result).toMatchObject({ outcome: 'applied' });
    expect((await run(refundsForPayment(paymentId)))[0]).toMatchObject({ status: 'failed', failureReason: 'expired_or_canceled_card' });
    expect((await paymentRow(paymentId)).status).toBe('paid');
  });

  it('remboursement initié chez le fournisseur : ligne externe créée et appliquée', async () => {
    const paymentId = await capturedPayment('external');
    const result = await refundEvent(paymentId, { providerRefundId: `mock_re_ext_${t}`, status: 'succeeded', refundId: null, amount: eur(2500), failureReason: null });
    expect(result).toMatchObject({ outcome: 'applied' });
    const [row] = await run(refundsForPayment(paymentId));
    expect(row).toMatchObject({ status: 'succeeded', requestedBy: null, reason: 'other', providerRefundId: `mock_re_ext_${t}`, idempotencyKey: `external:mock:mock_re_ext_${t}`, metadata: { origin: 'provider' } });
    expect((await paymentRow(paymentId)).status).toBe('refunded');
    expect((await run(listRefunds(orgId, { status: 'succeeded' }))).some((r) => r.id === row!.id)).toBe(true);
    expect((await run(listRefunds(otherOrg))).some((r) => r.id === row!.id)).toBe(false);
  });

  it('reprise cron : appel incertain rejoué, abandon au-delà de 23 h', async () => {
    const paymentId = await capturedPayment('stale');
    const now = new Date();
    const values = (key: string, amount: number, ageMs: number) => ({
      organizationId: orgId, paymentId, reference: `${PURPOSE}:${t}-stale`, provider: 'mock', amount, currency: 'EUR', idempotencyKey: `${t}-${key}`, requestedBy: author, createdAt: new Date(now.getTime() - ageMs),
    });
    const [retry] = await db.insert(refunds).values(values('retry', 500, 15 * 60_000)).returning();
    const [old] = await db.insert(refunds).values(values('old', 600, 24 * 3_600_000)).returning();
    const [fresh] = await db.insert(refunds).values(values('fresh', 700, 60_000)).returning();
    const result = await run(resumeStaleRefunds(now));
    expect(result.resumed).toBeGreaterThanOrEqual(1);
    expect(result.abandoned).toBeGreaterThanOrEqual(1);
    const rows = new Map((await run(refundsForPayment(paymentId))).map((r) => [r.id, r]));
    expect(rows.get(retry!.id)).toMatchObject({ status: 'succeeded', providerRefundId: `mock_re_${retry!.id}` });
    expect(rows.get(old!.id)).toMatchObject({ status: 'failed', failureReason: 'provider_unreachable' });
    expect(rows.get(fresh!.id)?.status).toBe('pending');
    expect((await paymentRow(paymentId)).status).toBe('partially_refunded');
  });
});

describe('réactions des modules', () => {
  const ISSUE_DAY = '2026-03-02';
  const invoiceDraft: SalesDocumentInput = {
    kind: 'invoice', organizationId: orgId, title: `${t} invoice`, customerName: 'Client Test', customerEmail: 'client@test.local',
    customerCountry: 'FR', customerType: 'B2C', sellerCountry: 'FR', supplyType: 'services', currency: 'EUR', paymentTermDays: 30,
    lines: [{ description: 'Prestation', quantity: '1', unitPriceMinor: 10000, taxCategory: 'standard' }],
  };

  it('Sales : avoir émis au TTC exact + encaissement négatif ; montant inatteignable refusé avant le fournisseur', async () => {
    const draft = await run(salesService.create(invoiceDraft, author, ISSUE_DAY));
    const invoice = await run(salesService.transition(draft.id, 'ISSUED', owner, 'fr', ISSUE_DAY));
    const { payment } = await run(startInvoiceCheckout(invoice, urls));
    await paid(payment.id, 12000);
    // 20 % : un HT entier donne 2 ou 4 centimes TTC, jamais 3.
    expect(await failure(requestRefund({ paymentId: payment.id, organizationId: orgId, requestedBy: author, amount: eur(3) }))).toMatchObject({ reason: 'handler', detail: 'unreachable_amount' });
    expect(await run(refundsForPayment(payment.id))).toHaveLength(0);

    const partial = await run(requestRefund({ paymentId: payment.id, organizationId: orgId, requestedBy: author, amount: eur(3000) }));
    expect(partial.status).toBe('succeeded');
    const [credit] = await db.select().from(sales).where(and(eq(sales.sourceDocumentId, invoice.id), eq(sales.kind, 'credit_note')));
    expect(credit).toMatchObject({ status: 'ISSUED', grossMinor: 3000, netMinor: 2500, taxMinor: 500 });
    expect(credit!.number).toBeTruthy();
    const after = (await db.select().from(sales).where(eq(sales.id, invoice.id)))[0]!;
    expect(after).toMatchObject({ status: 'PAID', paidMinor: 9000, creditedMinor: 3000 });
    const refundsRows = await db.select().from(salesPayments).where(and(eq(salesPayments.documentId, invoice.id), eq(salesPayments.reference, partial.id)));
    expect(refundsRows).toMatchObject([{ amountMinor: -3000, method: 'card' }]);

    await run(requestRefund({ paymentId: payment.id, organizationId: orgId, requestedBy: author }));
    const credits = await db.select().from(sales).where(and(eq(sales.sourceDocumentId, invoice.id), eq(sales.kind, 'credit_note')));
    expect(credits.map((c) => c.grossMinor).sort((a, b) => a - b)).toEqual([3000, 9000]);
    expect((await db.select().from(sales).where(eq(sales.id, invoice.id)))[0]).toMatchObject({ status: 'CREDITED', paidMinor: 0, creditedMinor: 12000 });
  });

  it('Bookings : acompte remboursé en totalité → réservation annulée ; partiel sans effet', async () => {
    const windows = [{ weekday: 1, start: '09:00', end: '12:00' }];
    const resource = await run(bookingsService.createResource({ organizationId: orgId, code: `${t}-R`.toUpperCase(), name: 'Salle', capacity: 2, timezone: 'Europe/Paris', slotMinutes: 60, windows }));
    await run(bookingsService.updateResource(resource.id, { code: resource.code, name: resource.name, capacity: 2, timezone: 'Europe/Paris', slotMinutes: 60, windows, deposit: '15.00', depositCurrency: 'eur' }));
    const book = (hour: string) => run(bookingsService.createGuestBooking({
      organizationId: orgId, resourceId: resource.id, startsAt: `2027-01-11T${hour}:00:00.000Z`, requireDeposit: true,
      customerName: 'Ada Lovelace', customerEmail: 'ada@example.test', customerPhone: null, partySize: 1, notes: null,
    }, new Date('2027-01-04T12:00:00Z'))).then((r) => r.booking);
    const status = async (id: string) => (await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, id)))[0]!.status;

    const booking = await book('08');
    const { payment } = await run(startDepositCheckout(booking, 'Salle', urls, new Date()));
    await paid(payment.id, 1500);
    expect(await status(booking.id)).toBe('CONFIRMED');
    await run(requestRefund({ paymentId: payment.id, organizationId: orgId, requestedBy: author, amount: eur(500) }));
    expect(await status(booking.id)).toBe('CONFIRMED');
    await run(requestRefund({ paymentId: payment.id, organizationId: orgId, requestedBy: author }));
    expect(await status(booking.id)).toBe('CANCELLED');
  });
});

describe('administration : panneau et formulaire', () => {
  type Locals = Parameters<typeof handleRefundPost>[0]['locals'];
  const as = (id: string | null, role = 'admin') => ({ user: id ? { id, role, banned: false } : null }) as unknown as Locals;
  const post = (locals: Locals, fields: Record<string, string>) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return handleRefundPost({ locals, params: { lang: 'fr' }, request: new Request('https://example.test/fr/admin/refunds', { method: 'POST', body }) });
  };
  const nonce = () => crypto.randomUUID();

  it('lecture tenant : panneau masqué sans droit, reste remboursable et nonce sinon', async () => {
    const paymentId = await capturedPayment('panel');
    const url = new URL('https://example.test/fr/admin/orders/x?refund=done');
    expect(await refundPanelView({ locals: as(member, 'user'), url }, `${PURPOSE}:${t}-panel`)).toBeNull();
    const view = await refundPanelView({ locals: as(author), url }, `${PURPOSE}:${t}-panel`);
    expect(view).toMatchObject({ notice: 'done', returnTo: '/fr/admin/orders/x', entries: [{ canRefund: true, summary: { remaining: 2500 }, payment: { id: paymentId } }] });
    expect((await refundPanelView({ locals: as(author), url: new URL('https://example.test/fr/admin/x?refund=<script>') }, `${PURPOSE}:${t}-panel`))?.notice).toBeNull();
  });

  it('POST : droits revérifiés, montant décimal, nonce idempotent, retour borné aux pages admin', async () => {
    const paymentId = await capturedPayment('form');
    const fields = { paymentId, nonce: nonce(), amount: '4,50', reason: 'return', note: 'Colis abîmé', returnTo: '/fr/admin/orders/abc' };
    expect((await post(as(null), fields)).headers.get('location')).toBe('/fr/admin/orders/abc?refund=forbidden#refunds');
    expect((await post(as(member, 'user'), fields)).headers.get('location')).toContain('refund=forbidden');
    expect(await run(refundsForPayment(paymentId))).toHaveLength(0);

    const ok = await post(as(author), fields);
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe('/fr/admin/orders/abc?refund=done#refunds');
    expect((await post(as(author), fields)).headers.get('location')).toContain('refund=done');
    const rows = await run(refundsForPayment(paymentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 450, reason: 'return', note: 'Colis abîmé', requestedBy: author, idempotencyKey: `admin:${author}:${fields.nonce}` });

    expect((await post(as(author), { ...fields, nonce: nonce(), amount: '30.00' })).headers.get('location')).toContain('refund=exceeded');
    expect((await post(as(author), { ...fields, nonce: nonce(), amount: '1.234' })).headers.get('location')).toContain('refund=invalidAmount');
    expect((await post(as(author), { ...fields, nonce: 'not-a-uuid' })).headers.get('location')).toContain('refund=invalidAmount');
    expect((await post(as(author), { ...fields, nonce: nonce(), reason: 'bogus' })).headers.get('location')).toContain('refund=invalidAmount');
    expect((await post(as(author), { ...fields, nonce: nonce(), paymentId: 'missing' })).headers.get('location')).toContain('refund=notFound');
    expect((await post(as(author), { ...fields, nonce: nonce(), amount: '1', returnTo: 'https://evil.test/x' })).headers.get('location')).toBe('/fr/admin?refund=done#refunds');
    expect((await post(as(author), { ...fields, nonce: nonce(), amount: '', returnTo: '//evil.test/fr/admin/x' })).headers.get('location')).toBe('/fr/admin?refund=done#refunds');
    expect((await paymentRow(paymentId)).status).toBe('refunded');
  });
});
