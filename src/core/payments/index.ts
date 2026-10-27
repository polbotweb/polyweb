/** core/payments — paiements en ligne génériques (fournisseur, webhooks idempotents, échéances). Voir docs/payments.md. */
export * from './errors';
export * from './provider';
export * from './reference';
export * from './transitions';
export * from './purposes';
export * from './gateway';
export * from './service';
export * from './refund-sink';
export { makeMockProvider, mockWebhookBody, signMockPayload, MOCK_SIGNATURE_HEADER, MOCK_REFUND_DECLINED_MINOR, MOCK_REFUND_PENDING_MINOR } from './mock';
export { makeStripeProvider, makeStripeClient, normalizeStripeEvent, stripeRefundStatus, toStripeAmount, fromStripeAmount, type StripeClientLike, type StripeWebhookVerifier } from './stripe';
