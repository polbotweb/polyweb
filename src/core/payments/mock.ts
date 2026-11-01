/**
 * Fournisseur mock (dev, tests, E2E — interdit en production sauf PAYMENTS_ALLOW_MOCK=true).
 * Déterministe ; ses webhooks sont signés HMAC-SHA256 (en-tête `x-polyweb-mock-signature`)
 * pour que l'endpoint n'accepte jamais un corps non signé, même hors production.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Effect, Schema } from 'effect';
import { MoneySchema } from '@/core/money';
import { PaymentProviderError, WebhookSignatureError } from './errors';
import type { PaymentProvider, ProviderSubscriptionState, VerifiedPaymentEvent, VerifiedSubscriptionEvent } from './provider';

export const MOCK_SIGNATURE_HEADER = 'x-polyweb-mock-signature';
/** Montants « magiques » du mock (tests) : refus fournisseur / remboursement asynchrone. */
export const MOCK_REFUND_DECLINED_MINOR = 13;
export const MOCK_REFUND_PENDING_MINOR = 17;

export const signMockPayload = (rawBody: string, secret: string) => createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

const MockRefund = Schema.Struct({
  providerRefundId: Schema.String,
  status: Schema.Literals(['pending', 'succeeded', 'failed', 'cancelled']),
  refundId: Schema.NullOr(Schema.String),
  amount: MoneySchema,
  failureReason: Schema.NullOr(Schema.String),
});

// Dates transportées en ISO (JSON.stringify) puis reconverties après décodage.
const IsoDate = Schema.String;
const MockSubscriptionInvoice = Schema.Struct({
  providerInvoiceId: Schema.String, amount: MoneySchema, periodStart: IsoDate, periodEnd: IsoDate,
  attempt: Schema.Number, nextAttemptAt: Schema.NullOr(IsoDate),
});
const SubscriptionStatus = Schema.Literals(['incomplete', 'trialing', 'active', 'past_due', 'cancelled', 'unpaid', 'paused']);
const MockSubscription = Schema.Struct({
  action: Schema.Literals(['created', 'updated', 'deleted', 'invoice_paid', 'invoice_failed']),
  subscriptionId: Schema.NullOr(Schema.String), providerSubscriptionId: Schema.String, providerCustomerId: Schema.NullOr(Schema.String),
  providerItemId: Schema.NullOr(Schema.String), providerProductId: Schema.NullOr(Schema.String),
  status: Schema.NullOr(SubscriptionStatus), cancelAtPeriodEnd: Schema.NullOr(Schema.Boolean), currentPeriodEnd: Schema.NullOr(IsoDate),
  invoice: Schema.NullOr(MockSubscriptionInvoice),
});
type MockSubscriptionEncoded = typeof MockSubscription.Type;

const toDate = (iso: string) => new Date(iso);
const toNullableDate = (iso: string | null) => (iso === null ? null : new Date(iso));
const reviveSubscription = (sub: MockSubscriptionEncoded): VerifiedSubscriptionEvent => ({
  ...sub,
  currentPeriodEnd: toNullableDate(sub.currentPeriodEnd),
  invoice: sub.invoice ? { ...sub.invoice, periodStart: toDate(sub.invoice.periodStart), periodEnd: toDate(sub.invoice.periodEnd), nextAttemptAt: toNullableDate(sub.invoice.nextAttemptAt) } : null,
});

const MockEvent = Schema.Struct({
  eventId: Schema.String,
  type: Schema.String,
  kind: Schema.Literals(['succeeded', 'failed', 'expired', 'refund', 'subscription', 'ignored']),
  paymentId: Schema.NullOr(Schema.String),
  providerPaymentId: Schema.NullOr(Schema.String),
  sessionId: Schema.NullOr(Schema.String),
  amount: Schema.NullOr(MoneySchema),
  refund: Schema.optional(Schema.NullOr(MockRefund)),
  subscription: Schema.optional(Schema.NullOr(MockSubscription)),
});
const decodeMockEvent = Schema.decodeUnknownEffect(Schema.fromJsonString(MockEvent));

/** Construit le corps d'un webhook mock (tests, outillage de dev). */
export const mockWebhookBody = (event: Omit<VerifiedPaymentEvent, 'provider'>) => JSON.stringify(event);

const mockState = (providerSubscriptionId: string, cancelAtPeriodEnd: boolean): ProviderSubscriptionState => ({ providerSubscriptionId, status: 'active', cancelAtPeriodEnd });

export const makeMockProvider = (secret: string): PaymentProvider => ({
  name: 'mock',
  signatureHeader: MOCK_SIGNATURE_HEADER,
  createCheckoutSession: (request) =>
    Effect.succeed({
      sessionId: `mock_cs_${request.paymentId}`,
      url: `${request.successUrl}${request.successUrl.includes('?') ? '&' : '?'}mock_session=mock_cs_${request.paymentId}`,
    }),
  createPaymentIntent: (request) => Effect.succeed({ intentId: `mock_pi_${request.paymentId}`, clientSecret: `mock_pi_${request.paymentId}_secret`, status: 'requires_payment_method' }),
  // Remboursement immédiat et déterministe (clé `refund:<id>` → `mock_re_<id>`) ; un montant
  // de 13 unités mineures simule un refus fournisseur, 17 un remboursement asynchrone (`pending`).
  refund: (request) =>
    request.amount.amountMinor === MOCK_REFUND_DECLINED_MINOR
      ? Effect.fail(new PaymentProviderError({ provider: 'mock', operation: 'refund.create', cause: 'declined', retryable: false }))
      : Effect.succeed({ providerRefundId: `mock_re_${request.refundId}`, status: request.amount.amountMinor === MOCK_REFUND_PENDING_MINOR ? 'pending' : 'succeeded' }),
  // Abonnements : identifiants déterministes ; l'état renvoyé reflète la demande.
  createSubscriptionCheckout: (request) =>
    Effect.succeed({
      sessionId: `mock_cs_sub_${request.subscriptionId}`,
      url: `${request.successUrl}${request.successUrl.includes('?') ? '&' : '?'}mock_session=mock_cs_sub_${request.subscriptionId}`,
    }),
  changeSubscriptionPrice: (request) => Effect.succeed(mockState(request.providerSubscriptionId, false)),
  cancelSubscription: (request) => Effect.succeed(request.atPeriodEnd ? mockState(request.providerSubscriptionId, true) : { providerSubscriptionId: request.providerSubscriptionId, status: 'cancelled', cancelAtPeriodEnd: false }),
  resumeSubscription: (request) => Effect.succeed(mockState(request.providerSubscriptionId, false)),
  verifyWebhook: (rawBody, signature) =>
    Effect.gen(function* () {
      const expected = Buffer.from(signMockPayload(rawBody, secret), 'utf8');
      const received = Buffer.from(signature ?? '', 'utf8');
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) return yield* new WebhookSignatureError({ reason: 'invalid signature' });
      const event = yield* decodeMockEvent(rawBody).pipe(Effect.mapError(() => new WebhookSignatureError({ reason: 'invalid payload' })));
      const { subscription, ...rest } = event;
      return { provider: 'mock' as const, ...rest, ...(subscription === undefined ? {} : { subscription: subscription ? reviveSubscription(subscription) : null }) };
    }),
});
