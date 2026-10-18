import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature, mockProvider, signMockWebhook } from '@/modules/payments/domain/providers';
import { canTransitionPayment, assertTransitionPayment } from '@/modules/payments/domain/transitions';

const secret = 'whsec_test';
function stripeHeader(body: string, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('payments providers', () => {
  it('accepts a valid Stripe signature', () => {
    const body = JSON.stringify({ type: 'checkout.session.completed' });
    expect(verifyStripeSignature(body, stripeHeader(body), secret)).toEqual({ type: 'checkout.session.completed' });
  });
  it('rejects tampered body, missing and expired signatures', () => {
    const body = '{"a":1}';
    expect(() => verifyStripeSignature('{"a":2}', stripeHeader(body), secret)).toThrow();
    expect(() => verifyStripeSignature(body, null, secret)).toThrow(/manquante/);
    expect(() => verifyStripeSignature(body, stripeHeader(body, Math.floor(Date.now() / 1000) - 3600), secret)).toThrow(/expirée/);
  });
  it('mock provider requires an HMAC signature', async () => {
    const body = JSON.stringify({ providerPaymentId: 'mock_pi_1', amount: 1000, currency: 'EUR' });
    await expect(mockProvider.verifyWebhook(body, 'bad')).rejects.toThrow();
    const event = await mockProvider.verifyWebhook(body, signMockWebhook(body));
    expect(event.outcome).toBe('checkout.completed');
    expect(event.amount).toBe(1000);
  });
  it('mock checkout session is deterministic per idempotency key', async () => {
    const input = { amount: 100, currency: 'EUR', idempotencyKey: 'k1', reference: 'order:1', successUrl: '/ok', cancelUrl: '/ko' };
    const a = await mockProvider.createCheckoutSession(input);
    const b = await mockProvider.createCheckoutSession(input);
    expect(a.providerSessionId).toBe(b.providerSessionId);
    expect(a.checkoutUrl).toContain('/ok?mock_session=');
  });
  it('enforces the payment state machine', () => {
    expect(canTransitionPayment('pending', 'paid')).toBe(true);
    expect(canTransitionPayment('paid', 'pending')).toBe(false);
    expect(() => assertTransitionPayment('refunded', 'paid')).toThrow();
  });
});
