import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { payments } from '@database/schemas';
import { mockProvider, mockPaymentIdForSession } from '@/modules/payments/domain/providers';
import { startCheckout, applyProviderEvent, PaymentAmountMismatchError } from '@/modules/payments/domain/payment-service';

const reference = `test-order:${Date.now()}`;

afterAll(async () => {
  await getDrizzle().delete(payments).where(eq(payments.reference, reference));
});

describe('payments service (real DB)', () => {
  it('creates a pending payment then marks it paid idempotently', async () => {
    const { payment } = await startCheckout({ reference, amount: 2500, successUrl: '/ok', cancelUrl: '/ko' }, { provider: mockProvider });
    expect(payment.status).toBe('pending');
    const event = { outcome: 'checkout.completed' as const, providerPaymentId: mockPaymentIdForSession(payment.providerSessionId!), amount: 2500, currency: 'EUR', idempotencyKey: payment.idempotencyKey, raw: {} };
    const paid = await applyProviderEvent(event);
    expect(paid?.status).toBe('paid');
    const replay = await applyProviderEvent(event);
    expect(replay?.status).toBe('paid');
  });

  it('rejects an amount mismatch', async () => {
    const { payment } = await startCheckout({ reference, amount: 1000, successUrl: '/ok', cancelUrl: '/ko' }, { provider: mockProvider });
    await expect(applyProviderEvent({ outcome: 'checkout.completed', providerPaymentId: 'x', amount: 1, currency: 'EUR', idempotencyKey: payment.idempotencyKey, raw: {} }))
      .rejects.toBeInstanceOf(PaymentAmountMismatchError);
  });

  it('ignores events for unknown payments', async () => {
    expect(await applyProviderEvent({ outcome: 'payment.failed', providerPaymentId: 'unknown', amount: 0, currency: 'EUR', raw: {} })).toBeNull();
  });
});
