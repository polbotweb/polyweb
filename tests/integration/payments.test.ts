/** core/payments sur base réelle : paiement hébergé (fournisseur mock), webhook signé idempotent, acompte de réservation payé / expiré / balayé. */
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
import { organization, payments } from '@database/schemas';
import { paymentEvents } from '@database/schemas/payments.schema';
import { appRuntime } from '@/lib/effect/runtime';
import {
  expireDuePayments, gatewayOf, handleWebhook, makeMockProvider, MOCK_SIGNATURE_HEADER, mockWebhookBody, PaymentGateway,
  registerPaymentPurpose, signMockPayload, startCheckout,
} from '@/core/payments';
import type { VerifiedPaymentEvent } from '@/core/payments';
import { bookings, bookingsResources } from '@/modules/bookings/schema';
import { bookingsService } from '@/modules/bookings/services/bookings.service';
import { BOOKING_PAYMENT_PURPOSE, registerBookingPayments, startDepositCheckout, sweepUnpaidBookings } from '@/modules/bookings/payments';

const SECRET = 'itest-mock-secret';
const db = getDrizzle();
const t = `pay-${Date.now().toString(36)}`;
const orgId = `${t}-org`;
const provider = makeMockProvider(SECRET);
const run = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromise(Effect.provideService(e, PaymentGateway, gatewayOf(provider)) as Effect.Effect<A, E, never>);
const runExit = <A, E>(e: Effect.Effect<A, E, any>) => appRuntime.runPromiseExit(Effect.provideService(e, PaymentGateway, gatewayOf(provider)) as Effect.Effect<A, E, never>);
const failTag = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? (exit.cause.reasons.find((r) => r._tag === 'Fail') as { error: { _tag?: string } } | undefined)?.error._tag : undefined;

let seq = 0;
const webhook = (event: Omit<VerifiedPaymentEvent, 'provider' | 'eventId'> & { eventId?: string }, secret = SECRET) => {
  const body = mockWebhookBody({ ...event, eventId: event.eventId ?? `evt_${t}_${seq++}` });
  return handleWebhook(body, new Headers({ [MOCK_SIGNATURE_HEADER]: signMockPayload(body, secret) }));
};
const succeeded = (paymentId: string, amountMinor: number, eventId?: string) =>
  webhook({ eventId, type: 'mock.succeeded', kind: 'succeeded', paymentId, providerPaymentId: `mock_pi_${paymentId}`, sessionId: null, amount: { amountMinor, currency: 'EUR' } });

const reactions: string[] = [];
const urls = { successUrl: 'https://example.test/ok', cancelUrl: 'https://example.test/ko' };
// 2027-01-11 est un lundi ; Europe/Paris = UTC+1 → créneaux 08:00Z, 09:00Z, 10:00Z.
const monday = '2027-01-11';
const windows = [{ weekday: 1, start: '09:00', end: '12:00' }];
let resourceId = '';

beforeAll(async () => {
  await db.insert(organization).values({ id: orgId, name: 'Payments org', slug: orgId, createdAt: new Date() });
  registerPaymentPurpose({ purpose: 'itest', onSucceeded: (_tx, _p, subjectId) => Effect.sync(() => { reactions.push(subjectId); }) });
  registerBookingPayments();
  const resource = await run(bookingsService.createResource({ organizationId: orgId, code: `${t}-R`.toUpperCase(), name: 'Salle à acompte', capacity: 2, timezone: 'Europe/Paris', slotMinutes: 60, windows }));
  resourceId = resource.id;
  const base = { code: resource.code, name: resource.name, capacity: 2, timezone: 'Europe/Paris', slotMinutes: 60, windows };
  expect(await run(bookingsService.updateResource(resourceId, { ...base, deposit: '15.00', depositCurrency: 'eur' }))).toMatchObject({ depositMinor: 1500, depositCurrency: 'EUR' });
  // Saisie absente : acompte inchangé ; précision invalide refusée.
  expect((await run(bookingsService.updateResource(resourceId, base))).depositMinor).toBe(1500);
  await expect(run(bookingsService.updateResource(resourceId, { ...base, deposit: '1.005' }))).rejects.toThrow();
});

afterAll(async () => {
  const ids = (await db.select({ id: payments.id }).from(payments).where(eq(payments.organizationId, orgId))).map((r) => r.id);
  if (ids.length > 0) await db.delete(paymentEvents).where(inArray(paymentEvents.paymentId, ids));
  await db.delete(paymentEvents).where(like(paymentEvents.eventId, `evt_${t}_%`));
  await db.delete(payments).where(eq(payments.organizationId, orgId));
  await db.delete(organization).where(eq(organization.id, orgId));
});

describe('core/payments (base réelle, fournisseur mock)', () => {
  it('crée un paiement en attente et réutilise le lien tant qu’il est valable', async () => {
    const first = await run(startCheckout({ organizationId: orgId, purpose: 'itest', subjectId: `${t}-a`, amount: { amountMinor: 2500, currency: 'EUR' }, description: 'Test', ...urls }));
    expect(first.payment.status).toBe('pending');
    expect(first.payment.reference).toBe(`itest:${t}-a`);
    expect(first.url).toContain(first.payment.id);
    const again = await run(startCheckout({ organizationId: orgId, purpose: 'itest', subjectId: `${t}-a`, amount: { amountMinor: 2500, currency: 'EUR' }, description: 'Test', ...urls }));
    expect(again.payment.id).toBe(first.payment.id);
  });

  it('applique un webhook signé une seule fois (idempotence par identifiant d’événement)', async () => {
    const { payment } = await run(startCheckout({ organizationId: orgId, purpose: 'itest', subjectId: `${t}-b`, amount: { amountMinor: 990, currency: 'EUR' }, description: 'Test', ...urls }));
    const eventId = `evt_${t}_dup`;
    const applied = await run(succeeded(payment.id, 990, eventId));
    expect(applied.status).toBe('applied');
    expect(await run(succeeded(payment.id, 990, eventId))).toMatchObject({ status: 'duplicate' });
    expect(await run(succeeded(payment.id, 990))).toMatchObject({ status: 'unchanged' });
    expect(reactions.filter((s) => s === `${t}-b`)).toHaveLength(1);
    const [row] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(row?.status).toBe('paid');
    expect(row?.paidAt).toBeInstanceOf(Date);
  });

  it('refuse une signature invalide et un montant différent (aucune écriture)', async () => {
    const { payment } = await run(startCheckout({ organizationId: orgId, purpose: 'itest', subjectId: `${t}-c`, amount: { amountMinor: 1000, currency: 'EUR' }, description: 'Test', ...urls }));
    expect(failTag(await runExit(webhook({ type: 'mock.succeeded', kind: 'succeeded', paymentId: payment.id, providerPaymentId: null, sessionId: null, amount: { amountMinor: 1000, currency: 'EUR' } }, 'wrong')))).toBe('WebhookSignatureError');
    const eventId = `evt_${t}_mismatch`;
    expect(failTag(await runExit(succeeded(payment.id, 1, eventId)))).toBe('PaymentAmountMismatchError');
    // Rollback : l'événement n'est pas mémorisé, une livraison corrigée reste possible.
    expect(await db.select().from(paymentEvents).where(eq(paymentEvents.eventId, eventId))).toHaveLength(0);
    const [row] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(row?.status).toBe('pending');
  });

  it('ignore les événements sans paiement connu', async () => {
    expect(await run(webhook({ type: 'mock.failed', kind: 'failed', paymentId: null, providerPaymentId: 'unknown', sessionId: null, amount: null }))).toMatchObject({ status: 'unmatched' });
  });
});

describe('acompte de réservation', () => {
  const now = new Date();
  const guestBooking = (hour: string) =>
    run(bookingsService.createGuestBooking({
      organizationId: orgId, resourceId, startsAt: `${monday}T${hour}:00:00.000Z`, requireDeposit: true,
      customerName: 'Ada Lovelace', customerEmail: 'ada@example.test', customerPhone: null, partySize: 1, notes: null,
    }, new Date('2027-01-04T12:00:00Z'))).then((r) => r.booking);

  it('retient l’acompte de la ressource et confirme la demande au paiement', async () => {
    const booking = await guestBooking('08');
    expect(booking).toMatchObject({ status: 'REQUESTED', depositMinor: 1500, depositCurrency: 'EUR' });
    expect(booking.paymentDueAt?.getTime()).toBe(new Date('2027-01-04T13:00:00Z').getTime());
    const { payment } = await run(startDepositCheckout(booking, 'Salle', urls, now));
    expect(payment.reference).toBe(`${BOOKING_PAYMENT_PURPOSE}:${booking.id}`);
    expect(payment.amount).toBe(1500);
    await run(succeeded(payment.id, 1500));
    const [row] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(row?.status).toBe('CONFIRMED');
    expect(row?.number).toBeTruthy();
    expect(row?.depositPaidAt).toBeInstanceOf(Date);
  });

  it('expire la demande quand le paiement expire', async () => {
    const booking = await guestBooking('09');
    const { payment } = await run(startDepositCheckout(booking, 'Salle', urls, now));
    await run(webhook({ type: 'mock.expired', kind: 'expired', paymentId: payment.id, providerPaymentId: null, sessionId: payment.providerSessionId, amount: null }));
    const [row] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(row?.status).toBe('EXPIRED');
  });

  it('balaie les demandes échues sans paiement (cron)', async () => {
    const booking = await guestBooking('10');
    expect(await run(sweepUnpaidBookings(new Date('2027-01-04T13:05:00Z')))).toBe(0); // marge de 10 min
    const result = await run(expireDuePayments(new Date('2027-01-04T13:11:00Z'), 10));
    expect(result.swept).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(row?.status).toBe('EXPIRED');
  });
});
