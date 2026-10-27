/**
 * Fournisseurs de paiement du module — façade de compatibilité : la source de vérité est
 * `@/core/payments` (adaptateur Stripe sur le SDK officiel `stripe`, fournisseur mock signé).
 */
export {
  MOCK_SIGNATURE_HEADER,
  makeMockProvider,
  makeStripeProvider,
  mockWebhookBody,
  providerFromEnv as selectPaymentProvider,
  signMockPayload,
  type PaymentProvider,
  type PaymentProviderName,
  type VerifiedPaymentEvent,
} from '@/core/payments';
