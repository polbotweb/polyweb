/**
 * Fournisseur mock (dev, tests, E2E — interdit en production sauf PAYMENTS_ALLOW_MOCK=true).
 * Déterministe ; ses webhooks sont signés HMAC-SHA256 (en-tête `x-polyweb-mock-signature`)
 * pour que l'endpoint n'accepte jamais un corps non signé, même hors production.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Effect, Schema } from 'effect';
import { MoneySchema } from '@/core/money';
import { WebhookSignatureError } from './errors';
import type { PaymentProvider, VerifiedPaymentEvent } from './provider';

export const MOCK_SIGNATURE_HEADER = 'x-polyweb-mock-signature';

export const signMockPayload = (rawBody: string, secret: string) => createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

const MockEvent = Schema.Struct({
  eventId: Schema.String,
  type: Schema.String,
  kind: Schema.Literals(['succeeded', 'failed', 'expired', 'refunded', 'ignored']),
  paymentId: Schema.NullOr(Schema.String),
  providerPaymentId: Schema.NullOr(Schema.String),
  sessionId: Schema.NullOr(Schema.String),
  amount: Schema.NullOr(MoneySchema),
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
  refund: (request) => Effect.succeed({ refundId: `mock_re_${request.providerPaymentId}` }),
  verifyWebhook: (rawBody, signature) =>
    Effect.gen(function* () {
      const expected = Buffer.from(signMockPayload(rawBody, secret), 'utf8');
      const received = Buffer.from(signature ?? '', 'utf8');
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) return yield* new WebhookSignatureError({ reason: 'invalid signature' });
      const event = yield* decodeMockEvent(rawBody).pipe(Effect.mapError(() => new WebhookSignatureError({ reason: 'invalid payload' })));
      return { provider: 'mock' as const, ...event };
    }),
});
