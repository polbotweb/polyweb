import { describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { Effect, Exit } from 'effect';
import {
  canTransitionPayment, clampExpiry, formatReference, fromStripeAmount, makeMockProvider, makeStripeProvider, mockWebhookBody,
  normalizeStripeEvent, parseReference, providerFromEnv, registerPaymentPurpose, paymentPurpose, signMockPayload, toStripeAmount,
  type StripeClientLike,
} from '@/core/payments';
import { checkoutCompleted, checkoutExpired, chargeRefunded, customerCreated, intentFailed, intentSucceeded, refundEvent } from '../../fixtures/payments/stripe-events';

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const failure = async <A, E>(effect: Effect.Effect<A, E>) => {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) throw new Error('expected failure');
  const reason = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return reason && reason._tag === 'Fail' ? (reason.error as { _tag: string } & Record<string, unknown>) : null;
};

const SECRET = 'whsec_test_polyweb_fixture';
const asEvent = (e: unknown) => e as Stripe.Event;
const signed = (payload: string, timestamp?: number) => Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, ...(timestamp ? { timestamp } : {}) });

const fakeClient = () => {
  const client = {
    checkout: { sessions: { create: vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.test/c/cs_test_1' })) } },
    paymentIntents: { create: vi.fn(async () => ({ id: 'pi_test_1', client_secret: 'pi_test_1_secret_x', status: 'requires_payment_method' as const })) },
    refunds: { create: vi.fn(async (): Promise<{ id: string; status: string | null }> => ({ id: 're_test_1', status: 'succeeded' })) },
    subscriptions: {
      update: vi.fn(async (id: string, params: Stripe.SubscriptionUpdateParams) => ({ id, status: 'active' as const, cancel_at_period_end: params.cancel_at_period_end ?? false })),
      cancel: vi.fn(async (id: string) => ({ id, status: 'canceled' as const, cancel_at_period_end: false })),
    },
  };
  return client satisfies StripeClientLike;
};

const request = {
  paymentId: '7f0e1c1e-0000-4000-8000-000000000001', reference: 'booking:abc', amount: { amountMinor: 4200, currency: 'EUR' as const }, description: 'Acompte',
  customerEmail: 'guest@example.test', successUrl: 'https://site.test/ok', cancelUrl: 'https://site.test/ko', expiresAt: new Date('2026-10-27T12:00:00Z'),
};

describe('core/payments — montants Stripe', () => {
  it('convertit les unités mineures ISO vers Stripe et retour', async () => {
    expect(await run(toStripeAmount({ amountMinor: 1999, currency: 'EUR' }))).toBe(1999);
    expect(await run(toStripeAmount({ amountMinor: 500, currency: 'JPY' }))).toBe(500);
    expect(await run(toStripeAmount({ amountMinor: 1500, currency: 'ISK' }))).toBe(150000);
    expect(await run(toStripeAmount({ amountMinor: 12340, currency: 'KWD' }))).toBe(12340);
    expect(fromStripeAmount(150000, 'isk')).toEqual({ amountMinor: 1500, currency: 'ISK' });
    expect(fromStripeAmount(1999, 'eur')).toEqual({ amountMinor: 1999, currency: 'EUR' });
    expect(fromStripeAmount(150050, 'isk')).toBeNull();
    expect(fromStripeAmount(10, 'xxx')).toBeNull();
    expect(fromStripeAmount(null, 'eur')).toBeNull();
  });
  it('refuse devises non prises en charge, montants nuls et précision impossible', async () => {
    expect((await failure(toStripeAmount({ amountMinor: 1000, currency: 'IQD' })))?.reason).toBe('currency');
    expect((await failure(toStripeAmount({ amountMinor: 0, currency: 'EUR' })))?.reason).toBe('non-positive');
    expect((await failure(toStripeAmount({ amountMinor: 1.5, currency: 'EUR' })))?.reason).toBe('non-positive');
    expect((await failure(toStripeAmount({ amountMinor: 12345, currency: 'KWD' })))?.reason).toBe('precision');
  });
});

describe('core/payments — normalisation des événements Stripe', () => {
  const id = 'pay-1';
  it('checkout payé, en attente, expiré', () => {
    expect(normalizeStripeEvent(asEvent(checkoutCompleted(id)))).toMatchObject({ kind: 'succeeded', paymentId: id, sessionId: `cs_test_${id}`, providerPaymentId: `pi_test_${id}`, amount: { amountMinor: 4200, currency: 'EUR' } });
    expect(normalizeStripeEvent(asEvent(checkoutCompleted(id, 4200, 'eur', 'unpaid'))).kind).toBe('ignored');
    expect(normalizeStripeEvent(asEvent(checkoutExpired(id)))).toMatchObject({ kind: 'expired', providerPaymentId: null });
  });
  it('payment intents, remboursements `refund.*`, `charge.refunded` et types inconnus ignorés', () => {
    expect(normalizeStripeEvent(asEvent(intentSucceeded(id)))).toMatchObject({ kind: 'succeeded', providerPaymentId: `pi_test_${id}` });
    expect(normalizeStripeEvent(asEvent(intentFailed(id))).kind).toBe('failed');
    expect(normalizeStripeEvent(asEvent(chargeRefunded(id))).kind).toBe('ignored');
    expect(normalizeStripeEvent(asEvent(refundEvent(id, { amount: 1500 })))).toMatchObject({
      kind: 'refund', paymentId: id, providerPaymentId: `pi_test_${id}`, amount: { amountMinor: 1500, currency: 'EUR' },
      refund: { providerRefundId: `re_test_${id}`, status: 'succeeded', refundId: `rf-${id}`, amount: { amountMinor: 1500, currency: 'EUR' }, failureReason: null },
    });
    expect(normalizeStripeEvent(asEvent(refundEvent(id, { type: 'refund.created', status: 'pending', refundId: null }))).refund).toMatchObject({ status: 'pending', refundId: null });
    expect(normalizeStripeEvent(asEvent(refundEvent(id, { type: 'refund.failed', status: 'failed', failureReason: 'expired_or_canceled_card' }))).refund).toMatchObject({ status: 'failed', failureReason: 'expired_or_canceled_card' });
    expect(normalizeStripeEvent(asEvent(refundEvent(id, { status: 'canceled' }))).refund?.status).toBe('cancelled');
    expect(normalizeStripeEvent(asEvent(refundEvent(id, { status: 'requires_action' }))).refund?.status).toBe('pending');
    expect(normalizeStripeEvent(asEvent(customerCreated()))).toMatchObject({ kind: 'ignored', paymentId: null, eventId: 'evt_cus' });
  });
});

describe('core/payments — adaptateur Stripe (client simulé)', () => {
  it('crée une Checkout Session idempotente avec métadonnées et compte connecté', async () => {
    const client = fakeClient();
    const provider = makeStripeProvider({ client, webhookSecret: SECRET });
    const session = await run(provider.createCheckoutSession({ ...request, accountId: 'acct_123', statementDescriptor: 'POLYWEB' }));
    expect(session).toEqual({ sessionId: 'cs_test_1', url: 'https://checkout.stripe.test/c/cs_test_1' });
    const [params, options] = client.checkout.sessions.create.mock.calls[0] as unknown as [Stripe.Checkout.SessionCreateParams, Stripe.RequestOptions];
    expect(params).toMatchObject({ mode: 'payment', customer_email: 'guest@example.test', expires_at: Math.floor(request.expiresAt.getTime() / 1000), metadata: { payment_id: request.paymentId, reference: 'booking:abc' } });
    expect(params.line_items?.[0]?.price_data).toMatchObject({ currency: 'eur', unit_amount: 4200 });
    expect(params.payment_intent_data?.metadata).toEqual({ payment_id: request.paymentId, reference: 'booking:abc' });
    expect(options).toEqual({ idempotencyKey: `checkout:${request.paymentId}`, stripeAccount: 'acct_123' });
  });
  it('crée un Payment Intent et un remboursement', async () => {
    const client = fakeClient();
    const provider = makeStripeProvider({ client, webhookSecret: SECRET });
    expect(await run(provider.createPaymentIntent(request))).toEqual({ intentId: 'pi_test_1', clientSecret: 'pi_test_1_secret_x', status: 'requires_payment_method' });
    expect((client.paymentIntents.create.mock.calls[0] as unknown[] | undefined)?.[1]).toEqual({ idempotencyKey: `intent:${request.paymentId}` });
    const refundRequest = { refundId: 'rf-1', paymentId: request.paymentId, providerPaymentId: 'pi_test_1', amount: { amountMinor: 1500, currency: 'EUR' as const }, reason: 'requested_by_customer' as const, idempotencyKey: 'refund:rf-1' };
    expect(await run(provider.refund({ ...refundRequest, accountId: 'acct_123' }))).toEqual({ providerRefundId: 're_test_1', status: 'succeeded' });
    const [params, options] = client.refunds.create.mock.calls[0] as unknown as [Stripe.RefundCreateParams, Stripe.RequestOptions];
    expect(params).toEqual({ payment_intent: 'pi_test_1', amount: 1500, metadata: { refund_id: 'rf-1', payment_id: request.paymentId }, reason: 'requested_by_customer' });
    expect(options).toEqual({ idempotencyKey: 'refund:rf-1', stripeAccount: 'acct_123' });
    client.refunds.create.mockResolvedValueOnce({ id: 're_test_2', status: 'pending' });
    expect(await run(provider.refund({ ...refundRequest, reason: null, idempotencyKey: 'refund:rf-2' }))).toEqual({ providerRefundId: 're_test_2', status: 'pending' });
    expect((client.refunds.create.mock.calls[1] as unknown as [Stripe.RefundCreateParams])[0]).not.toHaveProperty('reason');
  });
  it('classe les erreurs de remboursement : définitives (non rejouables) ou incertaines', async () => {
    const client = fakeClient();
    const provider = makeStripeProvider({ client, webhookSecret: SECRET });
    const refundRequest = { refundId: 'rf-3', paymentId: request.paymentId, providerPaymentId: 'pi_test_1', amount: { amountMinor: 1500, currency: 'EUR' as const }, reason: null, idempotencyKey: 'refund:rf-3' };
    client.refunds.create.mockRejectedValueOnce(Stripe.errors.StripeError.generate({ type: 'invalid_request_error', statusCode: 400, code: 'charge_already_refunded', message: 'x' }));
    expect((await failure(provider.refund(refundRequest)))?.retryable).toBe(false);
    client.refunds.create.mockRejectedValueOnce(Stripe.errors.StripeError.generate({ type: 'api_error', statusCode: 500, message: 'x' }));
    expect((await failure(provider.refund(refundRequest)))?.retryable).not.toBe(false);
  });
  it('assainit les erreurs Stripe (aucune donnée de requête)', async () => {
    const client = fakeClient();
    client.checkout.sessions.create.mockRejectedValueOnce(Stripe.errors.StripeError.generate({ type: 'card_error', code: 'card_declined', message: 'secret detail guest@example.test' }));
    const error = await failure(makeStripeProvider({ client, webhookSecret: SECRET }).createCheckoutSession(request));
    expect(error?._tag).toBe('PaymentProviderError');
    expect(String(error?.cause)).toMatch(/^Stripe\w+Error:card_declined/);
    expect(String(error?.cause)).not.toContain('guest@example.test');
  });
  it('vérifie la signature du webhook sur le corps brut', async () => {
    const provider = makeStripeProvider({ client: fakeClient(), webhookSecret: SECRET });
    const payload = JSON.stringify(checkoutCompleted('pay-2'));
    expect(await run(provider.verifyWebhook(payload, signed(payload)))).toMatchObject({ kind: 'succeeded', paymentId: 'pay-2' });
    expect((await failure(provider.verifyWebhook(payload.replace('4200', '1'), signed(payload))))?.reason).toBe('invalid signature');
    expect((await failure(provider.verifyWebhook(payload, null)))?.reason).toBe('missing signature');
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect((await failure(provider.verifyWebhook(payload, signed(payload, old))))?._tag).toBe('WebhookSignatureError');
  });
});

describe('core/payments — fournisseur mock', () => {
  const provider = makeMockProvider('mock-secret');
  it('est déterministe et exige une signature HMAC', async () => {
    expect((await run(provider.createCheckoutSession(request))).url).toBe(`https://site.test/ok?mock_session=mock_cs_${request.paymentId}`);
    const body = mockWebhookBody({ eventId: 'evt_1', type: 'mock.succeeded', kind: 'succeeded', paymentId: 'p', providerPaymentId: null, sessionId: null, amount: { amountMinor: 10, currency: 'EUR' } });
    expect(await run(provider.verifyWebhook(body, signMockPayload(body, 'mock-secret')))).toMatchObject({ provider: 'mock', kind: 'succeeded' });
    expect((await failure(provider.verifyWebhook(body, 'bad')))?.reason).toBe('invalid signature');
    expect((await failure(provider.verifyWebhook('{"x":1}', signMockPayload('{"x":1}', 'mock-secret'))))?.reason).toBe('invalid payload');
  });
});

describe('core/payments — configuration et règles', () => {
  it('sélectionne le fournisseur depuis l’environnement uniquement', async () => {
    expect((await failure(providerFromEnv({})))?._tag).toBe('PaymentsUnavailableError');
    expect((await run(providerFromEnv({ PAYMENTS_ENABLED: 'true' }))).name).toBe('mock');
    expect((await failure(providerFromEnv({ PAYMENTS_ENABLED: 'true', NODE_ENV: 'production' })))?.reason).toMatch(/production/);
    expect((await run(providerFromEnv({ PAYMENTS_ENABLED: 'true', NODE_ENV: 'production', PAYMENTS_ALLOW_MOCK: 'true' }))).name).toBe('mock');
    expect((await failure(providerFromEnv({ PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: 'stripe' })))?.reason).toMatch(/STRIPE_SECRET_KEY/);
    expect((await run(providerFromEnv({ PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET }))).name).toBe('stripe');
    expect((await failure(providerFromEnv({ PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: 'paypal' })))?.reason).toMatch(/inconnu/);
  });
  it('références <purpose>:<subjectId>', async () => {
    expect(await run(formatReference({ purpose: 'sales-invoice', subjectId: 'abc_1' }))).toBe('sales-invoice:abc_1');
    expect((await failure(formatReference({ purpose: 'Bad Purpose', subjectId: 'x' })))?._tag).toBe('UnknownPaymentPurposeError');
    expect(parseReference('booking:123')).toEqual({ purpose: 'booking', subjectId: '123' });
    expect(parseReference('nope')).toBeNull();
  });
  it('registre des objets de paiement', () => {
    registerPaymentPurpose({ purpose: 'unit-test' });
    expect(paymentPurpose('unit-test')).toEqual({ purpose: 'unit-test' });
    expect(() => registerPaymentPurpose({ purpose: 'X Y' })).toThrow();
  });
  it('échéance bornée à [30 min, 24 h]', () => {
    const now = new Date('2026-10-27T10:00:00Z');
    expect(clampExpiry(now, undefined, 60).toISOString()).toBe('2026-10-27T11:00:00.000Z');
    expect(clampExpiry(now, new Date('2026-10-27T10:05:00Z'), 60).toISOString()).toBe('2026-10-27T10:30:00.000Z');
    expect(clampExpiry(now, new Date('2026-10-30T10:00:00Z'), 60).toISOString()).toBe('2026-10-28T10:00:00.000Z');
  });
  it('machine d’états', () => {
    expect(canTransitionPayment('pending', 'paid')).toBe(true);
    expect(canTransitionPayment('expired', 'paid')).toBe(true);
    expect(canTransitionPayment('paid', 'pending')).toBe(false);
    expect(canTransitionPayment('refunded', 'paid')).toBe(false);
  });
});

describe('core/payments — abonnements (Stripe simulé + mock)', () => {
  const SUB_ID = '0198f2c4-0000-7000-8000-00000000abcd';
  const price = { amount: { amountMinor: 1990, currency: 'EUR' as const }, interval: 'month' as const, intervalCount: 1, productName: 'Pro' };
  const subObject = (over: Record<string, unknown> = {}) => ({
    id: 'sub_1', object: 'subscription', status: 'active', cancel_at_period_end: false, customer: 'cus_1', metadata: { subscription_id: SUB_ID },
    items: { data: [{ id: 'si_1', current_period_end: 1_790_000_000, price: { product: 'prod_1' } }] }, ...over,
  });
  const invoiceObject = (over: Record<string, unknown> = {}) => ({
    id: 'in_1', object: 'invoice', amount_paid: 1990, amount_due: 1990, currency: 'eur', customer: 'cus_1', attempt_count: 1, next_payment_attempt: null,
    period_start: 1_780_000_000, period_end: 1_780_000_000,
    parent: { subscription_details: { subscription: 'sub_1', metadata: { subscription_id: SUB_ID } } },
    lines: { data: [{ period: { start: 1_787_000_000, end: 1_790_000_000 } }] }, ...over,
  });
  const ev = (type: string, object: unknown) => asEvent({ id: `evt_${type}`, object: 'event', type, data: { object } });

  it('normalise customer.subscription.* (statut, fin de période, article, produit)', () => {
    const e = normalizeStripeEvent(ev('customer.subscription.updated', subObject({ status: 'past_due', cancel_at_period_end: true })));
    expect(e.kind).toBe('subscription');
    expect(e.subscription).toMatchObject({ action: 'updated', subscriptionId: SUB_ID, providerSubscriptionId: 'sub_1', providerItemId: 'si_1', providerProductId: 'prod_1', status: 'past_due', cancelAtPeriodEnd: true });
    expect(e.subscription?.currentPeriodEnd?.getTime()).toBe(1_790_000_000_000);
    expect(normalizeStripeEvent(ev('customer.subscription.deleted', subObject({ status: 'canceled' }))).subscription).toMatchObject({ action: 'deleted', status: 'cancelled' });
  });

  it('normalise invoice.paid / invoice.payment_failed avec période de ligne et relance', () => {
    const paid = normalizeStripeEvent(ev('invoice.paid', invoiceObject()));
    expect(paid.subscription).toMatchObject({ action: 'invoice_paid', invoice: { providerInvoiceId: 'in_1', amount: { amountMinor: 1990, currency: 'EUR' }, attempt: 1 } });
    expect(paid.subscription?.invoice?.periodStart.getTime()).toBe(1_787_000_000_000);
    const failed = normalizeStripeEvent(ev('invoice.payment_failed', invoiceObject({ amount_paid: 0, attempt_count: 2, next_payment_attempt: 1_788_000_000 })));
    expect(failed.subscription).toMatchObject({ action: 'invoice_failed', invoice: { attempt: 2, amount: { amountMinor: 1990 } } });
    expect(failed.subscription?.invoice?.nextAttemptAt?.getTime()).toBe(1_788_000_000_000);
    // Facture hors abonnement : ignorée.
    expect(normalizeStripeEvent(ev('invoice.paid', invoiceObject({ parent: null }))).kind).toBe('ignored');
  });

  it('checkout abonnement, changement de prix proratisé, résiliation et reprise', async () => {
    const client = fakeClient();
    const provider = makeStripeProvider({ client, webhookSecret: SECRET });
    await run(provider.createSubscriptionCheckout({ subscriptionId: SUB_ID, price, customerEmail: 'a@example.test', successUrl: 'https://x.test/ok', cancelUrl: 'https://x.test/ko', expiresAt: new Date(Date.now() + 3_600_000) }));
    const [params, options] = client.checkout.sessions.create.mock.calls[0] as unknown as [Stripe.Checkout.SessionCreateParams, Stripe.RequestOptions];
    expect(params).toMatchObject({ mode: 'subscription', subscription_data: { metadata: { subscription_id: SUB_ID } } });
    expect(params.line_items?.[0]?.price_data).toMatchObject({ unit_amount: 1990, recurring: { interval: 'month', interval_count: 1 }, product_data: { name: 'Pro' } });
    expect(options.idempotencyKey).toBe(`subscription-checkout:${SUB_ID}`);

    await run(provider.changeSubscriptionPrice({ subscriptionId: SUB_ID, providerSubscriptionId: 'sub_1', providerItemId: 'si_1', providerProductId: 'prod_1', price, prorate: true, idempotencyKey: 'chg:1' }));
    const [, upd] = client.subscriptions.update.mock.calls[0] as unknown as [string, Stripe.SubscriptionUpdateParams];
    expect(upd).toMatchObject({ proration_behavior: 'create_prorations', items: [{ id: 'si_1', price_data: { product: 'prod_1', unit_amount: 1990 } }] });

    expect(await run(provider.cancelSubscription({ providerSubscriptionId: 'sub_1', atPeriodEnd: true, idempotencyKey: 'c:1' }))).toEqual({ providerSubscriptionId: 'sub_1', status: 'active', cancelAtPeriodEnd: true });
    expect((await run(provider.cancelSubscription({ providerSubscriptionId: 'sub_1', atPeriodEnd: false, idempotencyKey: 'c:2' }))).status).toBe('cancelled');
    expect((await run(provider.resumeSubscription({ providerSubscriptionId: 'sub_1', idempotencyKey: 'r:1' }))).cancelAtPeriodEnd).toBe(false);
  });

  it('mock : événement abonnement signé, dates restaurées', async () => {
    const provider = makeMockProvider(SECRET);
    const body = mockWebhookBody({
      eventId: 'mock_evt_sub', type: 'invoice.paid', kind: 'subscription', paymentId: null, providerPaymentId: null, sessionId: null, amount: price.amount,
      subscription: { action: 'invoice_paid', subscriptionId: SUB_ID, providerSubscriptionId: 'mock_sub_1', providerCustomerId: null, providerItemId: null, providerProductId: null, status: null, cancelAtPeriodEnd: null, currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
        invoice: { providerInvoiceId: 'mock_in_1', amount: price.amount, periodStart: new Date('2026-11-01T00:00:00Z'), periodEnd: new Date('2026-12-01T00:00:00Z'), attempt: 1, nextAttemptAt: null } },
    });
    const e = await run(provider.verifyWebhook(body, signMockPayload(body, SECRET)));
    expect(e.subscription?.invoice?.periodStart).toBeInstanceOf(Date);
    expect(e.subscription?.invoice?.periodStart.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(await failure(provider.verifyWebhook(body, 'bad'))).toMatchObject({ _tag: 'WebhookSignatureError' });
  });
});
