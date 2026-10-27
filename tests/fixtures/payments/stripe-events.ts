/** Fixtures d'événements webhook Stripe (forme API 2026-09-30), sans aucun appel réseau. */
const base = (id: string, type: string, object: Record<string, unknown>) => ({
  id, object: 'event', api_version: '2026-09-30.endive', created: 1_790_000_000, livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null }, type, data: { object },
});

export const checkoutCompleted = (paymentId: string, amountTotal = 4200, currency = 'eur', paymentStatus = 'paid') =>
  base(`evt_cs_completed_${paymentId}`, 'checkout.session.completed', {
    id: `cs_test_${paymentId}`, object: 'checkout.session', amount_total: amountTotal, currency, payment_status: paymentStatus, status: 'complete',
    payment_intent: `pi_test_${paymentId}`, metadata: { payment_id: paymentId, reference: 'test:1' },
  });

export const checkoutExpired = (paymentId: string) =>
  base(`evt_cs_expired_${paymentId}`, 'checkout.session.expired', {
    id: `cs_test_${paymentId}`, object: 'checkout.session', amount_total: 4200, currency: 'eur', payment_status: 'unpaid', status: 'expired', payment_intent: null, metadata: { payment_id: paymentId },
  });

export const intentSucceeded = (paymentId: string, amountReceived = 4200, currency = 'eur') =>
  base(`evt_pi_ok_${paymentId}`, 'payment_intent.succeeded', { id: `pi_test_${paymentId}`, object: 'payment_intent', amount: amountReceived, amount_received: amountReceived, currency, metadata: { payment_id: paymentId } });

export const intentFailed = (paymentId: string) =>
  base(`evt_pi_ko_${paymentId}`, 'payment_intent.payment_failed', { id: `pi_test_${paymentId}`, object: 'payment_intent', amount: 4200, amount_received: 0, currency: 'eur', metadata: { payment_id: paymentId } });

export const chargeRefunded = (paymentId: string, refunded = true) =>
  base(`evt_ch_ref_${paymentId}`, 'charge.refunded', { id: `ch_test_${paymentId}`, object: 'charge', amount_refunded: refunded ? 4200 : 1000, refunded, currency: 'eur', payment_intent: `pi_test_${paymentId}`, metadata: { payment_id: paymentId } });

export const customerCreated = () => base('evt_cus', 'customer.created', { id: 'cus_1', object: 'customer' });

export const refundEvent = (paymentId: string, options: { type?: 'refund.created' | 'refund.updated' | 'refund.failed'; status?: string; amount?: number; refundId?: string | null; providerRefundId?: string; failureReason?: string | null } = {}) =>
  base(`evt_${options.type ?? 'refund.updated'}_${options.providerRefundId ?? `re_test_${paymentId}`}_${options.status ?? 'succeeded'}`, options.type ?? 'refund.updated', {
    id: options.providerRefundId ?? `re_test_${paymentId}`, object: 'refund', amount: options.amount ?? 4200, currency: 'eur', status: options.status ?? 'succeeded',
    payment_intent: `pi_test_${paymentId}`, failure_reason: options.failureReason ?? null,
    metadata: { payment_id: paymentId, ...(options.refundId === null ? {} : { refund_id: options.refundId ?? `rf-${paymentId}` }) },
  });
