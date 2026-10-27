/**
 * Contrat fournisseur de core/payments : tout fournisseur (Stripe, mock…) implémente
 * cette interface Effect. Les montants sont des `Money` (core/money, unités mineures
 * ISO 4217) ; la conversion vers les unités du fournisseur est de sa responsabilité.
 */
import type { Effect } from 'effect';
import type { Money } from '@/core/money';
import type { PaymentProviderError, UnsupportedAmountError, WebhookSignatureError } from './errors';

export type PaymentProviderName = 'stripe' | 'mock';

/** Options tenant transmises au fournisseur (aucun secret). */
export interface ProviderTenantOptions {
  /** Compte connecté Stripe Connect (`acct_…`), sinon compte plateforme. */
  readonly accountId?: string | null;
  readonly statementDescriptor?: string | null;
}

export interface CheckoutRequest extends ProviderTenantOptions {
  /** Identifiant interne du paiement : clé d'idempotence et métadonnée `payment_id`. */
  readonly paymentId: string;
  readonly reference: string;
  readonly amount: Money;
  readonly description: string;
  readonly customerEmail: string | null;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly expiresAt: Date;
}

export interface CheckoutSession {
  readonly sessionId: string;
  readonly url: string;
}

export interface PaymentIntentRequest extends ProviderTenantOptions {
  readonly paymentId: string;
  readonly reference: string;
  readonly amount: Money;
  readonly description: string;
  readonly customerEmail: string | null;
}

export interface PaymentIntentResult {
  readonly intentId: string;
  /** À transmettre au navigateur (Stripe Elements) ; jamais journalisé. */
  readonly clientSecret: string;
  readonly status: string;
}

export interface RefundRequest extends ProviderTenantOptions {
  readonly providerPaymentId: string;
  readonly amount?: Money;
  readonly idempotencyKey: string;
}

/** Issue normalisée d'un événement fournisseur vérifié. */
export type PaymentEventKind = 'succeeded' | 'failed' | 'expired' | 'refunded' | 'ignored';

export interface VerifiedPaymentEvent {
  readonly provider: PaymentProviderName;
  /** Identifiant unique de l'événement chez le fournisseur (idempotence). */
  readonly eventId: string;
  readonly type: string;
  readonly kind: PaymentEventKind;
  /** `payment_id` posé en métadonnée à la création (null si absent). */
  readonly paymentId: string | null;
  readonly providerPaymentId: string | null;
  readonly sessionId: string | null;
  /** Montant encaissé, en unités mineures ISO (null si non applicable). */
  readonly amount: Money | null;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** En-tête HTTP portant la signature du webhook. */
  readonly signatureHeader: string;
  readonly createCheckoutSession: (request: CheckoutRequest) => Effect.Effect<CheckoutSession, PaymentProviderError | UnsupportedAmountError>;
  readonly createPaymentIntent: (request: PaymentIntentRequest) => Effect.Effect<PaymentIntentResult, PaymentProviderError | UnsupportedAmountError>;
  readonly refund: (request: RefundRequest) => Effect.Effect<{ readonly refundId: string }, PaymentProviderError | UnsupportedAmountError>;
  /** Vérifie la signature sur le corps BRUT (octets reçus, jamais re-sérialisés). */
  readonly verifyWebhook: (rawBody: string, signature: string | null) => Effect.Effect<VerifiedPaymentEvent, WebhookSignatureError>;
}
