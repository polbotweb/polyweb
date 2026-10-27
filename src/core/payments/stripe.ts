/**
 * Adaptateur Stripe (SDK officiel `stripe`) de core/payments.
 *
 * - Paiement hébergé (Checkout Session, mode `payment`) pour les liens de paiement, et
 *   Payment Intents pour un paiement intégré ; `payment_id` en métadonnée des deux objets.
 * - Idempotence : clé `checkout:<paymentId>` / `intent:<paymentId>` (un rejeu ne crée
 *   jamais un second objet chez Stripe).
 * - Webhook : `Stripe.webhooks.constructEvent` sur le corps BRUT, tolérance 300 s.
 * - Remboursements (core/refunds) : `refunds.create` avec montant explicite, métadonnées
 *   `refund_id`/`payment_id`, clé `refund:<refundId>` ; événements `refund.created|updated|failed`
 *   normalisés en `kind = 'refund'` (`charge.refunded` est ignoré : doublon de `refund.*`).
 * - Montants : unités mineures ISO 4217 (core/money) converties en unités Stripe
 *   (ISK à 2 décimales chez Stripe, devises à 3 décimales multiples de 10).
 *
 * Le client est injecté (`StripeClientLike`) : les tests fournissent un double, aucun
 * appel réseau vers l'API Stripe en test ou en CI.
 */
import Stripe from 'stripe';
import { Duration, Effect } from 'effect';
import { currencyExponent, isCurrencyCode, type Money } from '@/core/money';
import { PaymentProviderError, UnsupportedAmountError, WebhookSignatureError } from './errors';
import type { PaymentEventKind, PaymentProvider, ProviderRefundStatus, ProviderTenantOptions, VerifiedPaymentEvent } from './provider';

/** Sous-ensemble du client Stripe utilisé (facilite le double de test). */
export interface StripeClientLike {
  readonly checkout: { readonly sessions: { create: (params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) => Promise<Pick<Stripe.Checkout.Session, 'id' | 'url'>> } };
  readonly paymentIntents: { create: (params: Stripe.PaymentIntentCreateParams, options?: Stripe.RequestOptions) => Promise<Pick<Stripe.PaymentIntent, 'id' | 'client_secret' | 'status'>> };
  readonly refunds: { create: (params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions) => Promise<Pick<Stripe.Refund, 'id' | 'status'>> };
}

export interface StripeWebhookVerifier {
  constructEvent: (payload: string, header: string, secret: string, tolerance?: number) => Stripe.Event;
}

const CALL_TIMEOUT = Duration.seconds(20);
const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Devises du catalogue core/money non acceptées par Stripe. */
const STRIPE_UNSUPPORTED = new Set(['IQD', 'LYD']);
/** Décimales Stripe différentes de l'ISO 4217 (ISK : 2 chez Stripe, 0 en ISO). */
const STRIPE_EXPONENT_OVERRIDES: Readonly<Record<string, number>> = { ISK: 2 };

const stripeExponent = (currency: string) => STRIPE_EXPONENT_OVERRIDES[currency] ?? (isCurrencyCode(currency) ? currencyExponent(currency) : -1);

/** Unités mineures ISO → unités Stripe (exactes, sinon `UnsupportedAmountError`). */
export const toStripeAmount = (value: Money): Effect.Effect<number, UnsupportedAmountError> => {
  const { amountMinor, currency } = value;
  if (STRIPE_UNSUPPORTED.has(currency) || !isCurrencyCode(currency)) return Effect.fail(new UnsupportedAmountError({ currency, amountMinor, reason: 'currency' }));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return Effect.fail(new UnsupportedAmountError({ currency, amountMinor, reason: 'non-positive' }));
  const iso = currencyExponent(currency);
  const amount = amountMinor * 10 ** (stripeExponent(currency) - iso);
  // Stripe : les devises à 3 décimales exigent un multiple de 10 (dernière décimale nulle).
  if (stripeExponent(currency) === 3 && amount % 10 !== 0) return Effect.fail(new UnsupportedAmountError({ currency, amountMinor, reason: 'precision' }));
  return Number.isSafeInteger(amount) ? Effect.succeed(amount) : Effect.fail(new UnsupportedAmountError({ currency, amountMinor, reason: 'precision' }));
};

/** Unités Stripe → `Money` ISO ; null si devise inconnue ou montant non entier. */
export const fromStripeAmount = (amount: number | null | undefined, currency: string | null | undefined): Money | null => {
  const code = (currency ?? '').toUpperCase();
  if (typeof amount !== 'number' || !isCurrencyCode(code) || STRIPE_UNSUPPORTED.has(code)) return null;
  const factor = 10 ** (stripeExponent(code) - currencyExponent(code));
  const minor = amount / factor;
  return Number.isSafeInteger(minor) ? { amountMinor: minor, currency: code } : null;
};

const requestOptions = (idempotencyKey: string, tenant: ProviderTenantOptions): Stripe.RequestOptions => ({
  idempotencyKey,
  ...(tenant.accountId ? { stripeAccount: tenant.accountId } : {}),
});

/** Message d'erreur sans donnée sensible (type + code Stripe, jamais la requête). */
const safeCause = (cause: unknown) =>
  cause instanceof Stripe.errors.StripeError ? `${cause.type}${cause.code ? `:${cause.code}` : ''} (${cause.statusCode ?? 'n/a'})` : cause instanceof Error ? cause.name : 'unknown';

/** Refus définitifs (4xx hors 409/429) : rejouer la même requête idempotente ne changerait rien. */
const DEFINITIVE_STRIPE_ERRORS: ReadonlySet<string> = new Set(['StripeCardError', 'StripeInvalidRequestError', 'StripeAuthenticationError', 'StripePermissionError', 'StripeIdempotencyError']);

const isRetryable = (cause: unknown) => !(cause instanceof Stripe.errors.StripeError && DEFINITIVE_STRIPE_ERRORS.has(cause.type));

const call = <A>(operation: string, f: () => Promise<A>) =>
  Effect.tryPromise({ try: f, catch: (cause) => new PaymentProviderError({ provider: 'stripe', operation, cause: safeCause(cause), retryable: isRetryable(cause) }) }).pipe(
    Effect.timeoutOrElse({ duration: CALL_TIMEOUT, orElse: () => Effect.fail(new PaymentProviderError({ provider: 'stripe', operation, cause: 'timeout' })) }),
    Effect.withSpan(`payments.stripe.${operation}`),
  );

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === 'string' ? value : value?.id ?? null);
const metadataPaymentId = (metadata: Stripe.Metadata | null | undefined) => (typeof metadata?.payment_id === 'string' && metadata.payment_id ? metadata.payment_id : null);

/** Statut Stripe d'un remboursement → statut normalisé (`requires_action` reste en attente). */
export const stripeRefundStatus = (status: string | null | undefined): ProviderRefundStatus =>
  status === 'succeeded' ? 'succeeded' : status === 'failed' ? 'failed' : status === 'canceled' ? 'cancelled' : 'pending';

/** Normalise un événement Stripe vérifié (types non gérés → `ignored`). */
export const normalizeStripeEvent = (event: Stripe.Event): VerifiedPaymentEvent => {
  const base = { provider: 'stripe' as const, eventId: event.id, type: event.type };
  const ignored: VerifiedPaymentEvent = { ...base, kind: 'ignored', paymentId: null, providerPaymentId: null, sessionId: null, amount: null };
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = event.data.object;
      let kind: PaymentEventKind;
      if (event.type === 'checkout.session.expired') kind = 'expired';
      else if (event.type === 'checkout.session.async_payment_failed') kind = 'failed';
      // `completed` sans fonds (moyen de paiement différé) : on attend `async_payment_succeeded`.
      else kind = session.payment_status === 'paid' ? 'succeeded' : 'ignored';
      return { ...base, kind, paymentId: metadataPaymentId(session.metadata), providerPaymentId: idOf(session.payment_intent), sessionId: session.id, amount: fromStripeAmount(session.amount_total, session.currency) };
    }
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      const succeeded = event.type === 'payment_intent.succeeded';
      return { ...base, kind: succeeded ? 'succeeded' : 'failed', paymentId: metadataPaymentId(intent.metadata), providerPaymentId: intent.id, sessionId: null, amount: fromStripeAmount(succeeded ? intent.amount_received : intent.amount, intent.currency) };
    }
    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed': {
      const refund = event.data.object;
      const amount = fromStripeAmount(refund.amount, refund.currency);
      if (!amount) return ignored;
      const status: ProviderRefundStatus = event.type === 'refund.failed' ? 'failed' : stripeRefundStatus(refund.status);
      return {
        ...base, kind: 'refund', paymentId: metadataPaymentId(refund.metadata), providerPaymentId: idOf(refund.payment_intent), sessionId: null, amount,
        refund: { providerRefundId: refund.id, status, refundId: typeof refund.metadata?.refund_id === 'string' && refund.metadata.refund_id ? refund.metadata.refund_id : null, amount, failureReason: refund.failure_reason ?? null },
      };
    }
    default:
      return ignored;
  }
};

export interface StripeProviderOptions {
  readonly client: StripeClientLike;
  readonly webhookSecret: string;
  readonly verifier?: StripeWebhookVerifier;
}

export const makeStripeProvider = ({ client, webhookSecret, verifier = Stripe.webhooks }: StripeProviderOptions): PaymentProvider => ({
  name: 'stripe',
  signatureHeader: 'stripe-signature',

  createCheckoutSession: (request) =>
    Effect.gen(function* () {
      const unitAmount = yield* toStripeAmount(request.amount);
      const metadata = { payment_id: request.paymentId, reference: request.reference };
      const session = yield* call('checkout.create', () =>
        client.checkout.sessions.create(
          {
            mode: 'payment',
            line_items: [{ quantity: 1, price_data: { currency: request.amount.currency.toLowerCase(), unit_amount: unitAmount, product_data: { name: request.description.slice(0, 250) } } }],
            success_url: request.successUrl,
            cancel_url: request.cancelUrl,
            client_reference_id: request.paymentId,
            expires_at: Math.floor(request.expiresAt.getTime() / 1000),
            ...(request.customerEmail ? { customer_email: request.customerEmail } : {}),
            metadata,
            payment_intent_data: { metadata, ...(request.statementDescriptor ? { statement_descriptor_suffix: request.statementDescriptor.slice(0, 22) } : {}) },
          },
          requestOptions(`checkout:${request.paymentId}`, request),
        ),
      );
      if (!session.url) return yield* new PaymentProviderError({ provider: 'stripe', operation: 'checkout.create', cause: 'missing session url' });
      return { sessionId: session.id, url: session.url };
    }),

  createPaymentIntent: (request) =>
    Effect.gen(function* () {
      const amount = yield* toStripeAmount(request.amount);
      const intent = yield* call('intent.create', () =>
        client.paymentIntents.create(
          {
            amount,
            currency: request.amount.currency.toLowerCase(),
            description: request.description.slice(0, 1000),
            automatic_payment_methods: { enabled: true },
            metadata: { payment_id: request.paymentId, reference: request.reference },
            ...(request.customerEmail ? { receipt_email: request.customerEmail } : {}),
            ...(request.statementDescriptor ? { statement_descriptor_suffix: request.statementDescriptor.slice(0, 22) } : {}),
          },
          requestOptions(`intent:${request.paymentId}`, request),
        ),
      );
      if (!intent.client_secret) return yield* new PaymentProviderError({ provider: 'stripe', operation: 'intent.create', cause: 'missing client secret' });
      return { intentId: intent.id, clientSecret: intent.client_secret, status: intent.status };
    }),

  refund: (request) =>
    Effect.gen(function* () {
      const amount = yield* toStripeAmount(request.amount);
      const refund = yield* call('refund.create', () =>
        client.refunds.create(
          {
            payment_intent: request.providerPaymentId, amount,
            metadata: { refund_id: request.refundId, payment_id: request.paymentId },
            ...(request.reason ? { reason: request.reason } : {}),
          },
          requestOptions(request.idempotencyKey, request),
        ),
      );
      return { providerRefundId: refund.id, status: stripeRefundStatus(refund.status) };
    }),

  verifyWebhook: (rawBody, signature) =>
    Effect.gen(function* () {
      if (!signature) return yield* new WebhookSignatureError({ reason: 'missing signature' });
      const event = yield* Effect.try({
        try: () => verifier.constructEvent(rawBody, signature, webhookSecret, SIGNATURE_TOLERANCE_SECONDS),
        catch: (cause) => new WebhookSignatureError({ reason: cause instanceof Stripe.errors.StripeSignatureVerificationError ? 'invalid signature' : 'invalid payload' }),
      });
      return normalizeStripeEvent(event);
    }),
});

/** Client Stripe réel (clé secrète depuis l'environnement uniquement). */
export const makeStripeClient = (secretKey: string): StripeClientLike =>
  new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'polyweb' }, telemetry: false });
