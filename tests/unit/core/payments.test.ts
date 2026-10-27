import { describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { Effect, Exit } from 'effect';
import {
  canTransitionPayment, clampExpiry, formatReference, fromStripeAmount, makeMockProvider, makeStripeProvider, mockWebhookBody,
  normalizeStripeEvent, parseReference, providerFromEnv, registerPaymentPurpose, paymentPurpose, signMockPayload, toStripeAmount,
  type StripeClientLike,
} from '@/core/payments';
import { checkoutCompleted, checkoutExpired, chargeRefunded, customerCreated, intentFailed, intentSucceeded } from '../../fixtures/payments/stripe-events';

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
    refunds: { create: vi.fn(async () => ({ id: 're_test_1' })) },
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
  it('payment intents, remboursement total seulement, types inconnus ignorés', () => {
    expect(normalizeStripeEvent(asEvent(intentSucceeded(id)))).toMatchObject({ kind: 'succeeded', providerPaymentId: `pi_test_${id}` });
    expect(normalizeStripeEvent(asEvent(intentFailed(id))).kind).toBe('failed');
    expect(normalizeStripeEvent(asEvent(chargeRefunded(id))).kind).toBe('refunded');
    expect(normalizeStripeEvent(asEvent(chargeRefunded(id, false))).kind).toBe('ignored');
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
    expect(await run(provider.refund({ providerPaymentId: 'pi_test_1', idempotencyKey: 'refund:1' }))).toEqual({ refundId: 're_test_1' });
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
