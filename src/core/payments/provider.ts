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
  /** Identifiant interne du remboursement (core/refunds) : métadonnée `refund_id`. */
  readonly refundId: string;
  readonly paymentId: string;
  readonly providerPaymentId: string;
  /** Toujours explicite (jamais « le reste » implicite) : core/refunds en a vérifié le plafond. */
  readonly amount: Money;
  readonly reason: ProviderRefundReason | null;
  readonly idempotencyKey: string;
}

/** Motifs transmis au fournisseur (sous-ensemble Stripe) ; les autres motifs restent internes. */
export type ProviderRefundReason = 'requested_by_customer' | 'duplicate' | 'fraudulent';

/** Statut normalisé d'un remboursement chez le fournisseur. */
export type ProviderRefundStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';

export interface RefundResult {
  readonly providerRefundId: string;
  readonly status: ProviderRefundStatus;
}

/** Remboursement décrit par un événement fournisseur (`refund.created|updated|failed`). */
export interface VerifiedRefund {
  readonly providerRefundId: string;
  readonly status: ProviderRefundStatus;
  /** `refund_id` posé en métadonnée par core/refunds (null : remboursement initié chez le fournisseur). */
  readonly refundId: string | null;
  readonly amount: Money;
  readonly failureReason: string | null;
}

/** Issue normalisée d'un événement fournisseur vérifié (`refund` : traité par core/refunds). */
export type PaymentEventKind = 'succeeded' | 'failed' | 'expired' | 'refund' | 'subscription' | 'ignored';

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
  /** Présent si `kind = 'refund'`. */
  readonly refund?: VerifiedRefund | null;
  /** Présent si `kind = 'subscription'` (traité par le module subscriptions via `setSubscriptionEventSink`). */
  readonly subscription?: VerifiedSubscriptionEvent | null;
}

// --- Abonnements ------------------------------------------------------------------------

/** Statut normalisé d'un abonnement chez le fournisseur. */
export type ProviderSubscriptionStatus = 'incomplete' | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'unpaid' | 'paused';

export type SubscriptionInterval = 'day' | 'week' | 'month' | 'year';

/** Prix récurrent décrit en ligne (aucun objet Price à synchroniser chez le fournisseur). */
export interface RecurringPrice {
  readonly amount: Money;
  readonly interval: SubscriptionInterval;
  readonly intervalCount: number;
  readonly productName: string;
}

export interface SubscriptionCheckoutRequest extends ProviderTenantOptions {
  /** Identifiant interne de l'abonnement : clé d'idempotence et métadonnée `subscription_id`. */
  readonly subscriptionId: string;
  readonly price: RecurringPrice;
  readonly customerEmail: string | null;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly expiresAt: Date;
}

export interface SubscriptionChangeRequest extends ProviderTenantOptions {
  readonly subscriptionId: string;
  readonly providerSubscriptionId: string;
  readonly providerItemId: string;
  /** Produit fournisseur de l'article (créé au checkout, relu des événements). */
  readonly providerProductId: string;
  readonly price: RecurringPrice;
  /** Prorata au changement (le fournisseur le facture sur la prochaine échéance). */
  readonly prorate: boolean;
  readonly idempotencyKey: string;
}

export interface SubscriptionCancelRequest extends ProviderTenantOptions {
  readonly providerSubscriptionId: string;
  /** `true` : fin de période (réversible par `resume`) ; `false` : immédiat. */
  readonly atPeriodEnd: boolean;
  readonly idempotencyKey: string;
}

export interface ProviderSubscriptionState {
  readonly providerSubscriptionId: string;
  readonly status: ProviderSubscriptionStatus;
  readonly cancelAtPeriodEnd: boolean;
}

/** Facture fournisseur d'une période d'abonnement. */
export interface VerifiedSubscriptionInvoice {
  readonly providerInvoiceId: string;
  readonly amount: Money;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  /** Numéro de tentative de prélèvement (relances). */
  readonly attempt: number;
  readonly nextAttemptAt: Date | null;
}

export type SubscriptionEventAction = 'created' | 'updated' | 'deleted' | 'invoice_paid' | 'invoice_failed';

export interface VerifiedSubscriptionEvent {
  readonly action: SubscriptionEventAction;
  /** `subscription_id` posé en métadonnée à la création (null si absent). */
  readonly subscriptionId: string | null;
  readonly providerSubscriptionId: string;
  readonly providerCustomerId: string | null;
  readonly providerItemId: string | null;
  readonly providerProductId: string | null;
  readonly status: ProviderSubscriptionStatus | null;
  readonly cancelAtPeriodEnd: boolean | null;
  readonly currentPeriodEnd: Date | null;
  readonly invoice: VerifiedSubscriptionInvoice | null;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** En-tête HTTP portant la signature du webhook. */
  readonly signatureHeader: string;
  readonly createCheckoutSession: (request: CheckoutRequest) => Effect.Effect<CheckoutSession, PaymentProviderError | UnsupportedAmountError>;
  readonly createPaymentIntent: (request: PaymentIntentRequest) => Effect.Effect<PaymentIntentResult, PaymentProviderError | UnsupportedAmountError>;
  readonly refund: (request: RefundRequest) => Effect.Effect<RefundResult, PaymentProviderError | UnsupportedAmountError>;
  readonly createSubscriptionCheckout: (request: SubscriptionCheckoutRequest) => Effect.Effect<CheckoutSession, PaymentProviderError | UnsupportedAmountError>;
  readonly changeSubscriptionPrice: (request: SubscriptionChangeRequest) => Effect.Effect<ProviderSubscriptionState, PaymentProviderError | UnsupportedAmountError>;
  readonly cancelSubscription: (request: SubscriptionCancelRequest) => Effect.Effect<ProviderSubscriptionState, PaymentProviderError>;
  /** Annule une résiliation programmée en fin de période. */
  readonly resumeSubscription: (request: Omit<SubscriptionCancelRequest, 'atPeriodEnd'>) => Effect.Effect<ProviderSubscriptionState, PaymentProviderError>;
  /** Vérifie la signature sur le corps BRUT (octets reçus, jamais re-sérialisés). */
  readonly verifyWebhook: (rawBody: string, signature: string | null) => Effect.Effect<VerifiedPaymentEvent, WebhookSignatureError>;
}
