/**
 * Fournisseur mock (dev, tests, E2E — interdit en production sauf PAYMENTS_ALLOW_MOCK=true).
 * Déterministe ; ses webhooks sont signés HMAC-SHA256 (en-tête `x-polyweb-mock-signature`)
 * pour que l'endpoint n'accepte jamais un corps non signé, même hors production.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Effect, Schema } from 'effect';
import { MoneySchema } from '@/core/money';
import { PaymentProviderError, WebhookSignatureError } from './errors';
import type { PaymentProvider, VerifiedPaymentEvent } from './provider';

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

const MockEvent = Schema.Struct({
  eventId: Schema.String,
  type: Schema.String,
  kind: Schema.Literals(['succeeded', 'failed', 'expired', 'refund', 'ignored']),
  paymentId: Schema.NullOr(Schema.String),
  providerPaymentId: Schema.NullOr(Schema.String),
  sessionId: Schema.NullOr(Schema.String),
  amount: Schema.NullOr(MoneySchema),
  refund: Schema.optional(Schema.NullOr(MockRefund)),
});
const decodeMockEvent = Schema.decodeUnknownEffect(Schema.fromJsonString(MockEvent));

/** Construit le corps d'un webhook mock (tests, outillage de dev). */
export const mockWebhookBody = (event: Omit<VerifiedPaymentEvent, 'provider'>) => JSON.stringify(event);

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
  verifyWebhook: (rawBody, signature) =>
    Effect.gen(function* () {
      const expected = Buffer.from(signMockPayload(rawBody, secret), 'utf8');
      const received = Buffer.from(signature ?? '', 'utf8');
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) return yield* new WebhookSignatureError({ reason: 'invalid signature' });
      const event = yield* decodeMockEvent(rawBody).pipe(Effect.mapError(() => new WebhookSignatureError({ reason: 'invalid payload' })));
      return { provider: 'mock' as const, ...event };
    }),
});
