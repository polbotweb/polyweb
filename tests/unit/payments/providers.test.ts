import { describe, it, expect } from 'vitest';
import Stripe from 'stripe';
import { Effect, Exit } from 'effect';
import { makeMockProvider, makeStripeProvider, mockWebhookBody, selectPaymentProvider, signMockPayload } from '@/modules/payments/domain/providers';
import { canTransitionPayment, assertTransitionPayment } from '@/modules/payments/domain/transitions';

const secret = 'whsec_test';
const noNetwork = {
  checkout: { sessions: { create: () => Promise.reject(new Error('no network in tests')) } },
  paymentIntents: { create: () => Promise.reject(new Error('no network in tests')) },
  refunds: { create: () => Promise.reject(new Error('no network in tests')) },
};

describe('payments module (façade core/payments)', () => {
  it('accepts a valid Stripe signature and rejects tampered, missing and expired ones', async () => {
    const provider = makeStripeProvider({ client: noNetwork, webhookSecret: secret });
    const body = JSON.stringify({ id: 'evt_1', object: 'event', type: 'customer.created', data: { object: {} } });
    const header = (t?: number) => Stripe.webhooks.generateTestHeaderString({ payload: body, secret, ...(t ? { timestamp: t } : {}) });
    expect((await Effect.runPromise(provider.verifyWebhook(body, header()))).kind).toBe('ignored');
    expect(Exit.isFailure(await Effect.runPromiseExit(provider.verifyWebhook(body.replace('evt_1', 'evt_2'), header())))).toBe(true);
    expect(Exit.isFailure(await Effect.runPromiseExit(provider.verifyWebhook(body, null)))).toBe(true);
    expect(Exit.isFailure(await Effect.runPromiseExit(provider.verifyWebhook(body, header(Math.floor(Date.now() / 1000) - 3600))))).toBe(true);
  });
  it('mock provider requires an HMAC signature', async () => {
    const mock = makeMockProvider('s');
    const body = mockWebhookBody({ eventId: 'e', type: 'mock', kind: 'succeeded', paymentId: 'p', providerPaymentId: null, sessionId: null, amount: { amountMinor: 1000, currency: 'EUR' } });
    expect(Exit.isFailure(await Effect.runPromiseExit(mock.verifyWebhook(body, 'bad')))).toBe(true);
    expect((await Effect.runPromise(mock.verifyWebhook(body, signMockPayload(body, 's')))).amount).toEqual({ amountMinor: 1000, currency: 'EUR' });
  });
  it('selects the mock provider outside production only', async () => {
    expect((await Effect.runPromise(selectPaymentProvider({ PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: 'mock' }))).name).toBe('mock');
    expect(Exit.isFailure(await Effect.runPromiseExit(selectPaymentProvider({ PAYMENTS_ENABLED: 'true', NODE_ENV: 'production' })))).toBe(true);
  });
  it('enforces the payment state machine', () => {
    expect(canTransitionPayment('pending', 'paid')).toBe(true);
    expect(canTransitionPayment('paid', 'pending')).toBe(false);
    expect(() => assertTransitionPayment('refunded', 'paid')).toThrow();
  });
});
