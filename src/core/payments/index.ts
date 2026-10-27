/** core/payments — paiements en ligne génériques (fournisseur, webhooks idempotents, échéances). Voir docs/payments.md. */
export * from './errors';
export * from './provider';
export * from './reference';
export * from './transitions';
export * from './purposes';
export * from './gateway';
export * from './service';
export { makeMockProvider, mockWebhookBody, signMockPayload, MOCK_SIGNATURE_HEADER } from './mock';
export { makeStripeProvider, makeStripeClient, normalizeStripeEvent, toStripeAmount, fromStripeAmount, type StripeClientLike, type StripeWebhookVerifier } from './stripe';
