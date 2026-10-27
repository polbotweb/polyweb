/**
 * `PaymentGateway` : service Effect qui résout le fournisseur actif depuis l'environnement
 * (seule source des secrets) — PAYMENTS_ENABLED, PAYMENT_PROVIDER (`stripe` | `mock`),
 * STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYMENTS_MOCK_SECRET, PAYMENTS_ALLOW_MOCK.
 * Résolution paresseuse et mémorisée : l'absence de clés n'empêche pas l'application de
 * démarrer, seul l'usage du paiement échoue (`PaymentsUnavailableError`). Les tests
 * fournissent `Layer.succeed(PaymentGateway, gatewayOf(provider))`.
 */
import { Context, Effect, Layer } from 'effect';
import { PaymentsUnavailableError } from './errors';
import { makeMockProvider } from './mock';
import type { PaymentProvider } from './provider';
import { makeStripeClient, makeStripeProvider } from './stripe';

export interface PaymentGatewayShape {
  readonly provider: Effect.Effect<PaymentProvider, PaymentsUnavailableError>;
}

export class PaymentGateway extends Context.Service<PaymentGateway, PaymentGatewayShape>()('polyweb/PaymentGateway') {}

type Env = Readonly<Record<string, string | undefined>>;

export const isPaymentsEnabled = (env: Env = process.env) => env.PAYMENTS_ENABLED === 'true';

/** Fournisseur décrit par l'environnement (pur : testable sans réseau). */
export const providerFromEnv = (env: Env): Effect.Effect<PaymentProvider, PaymentsUnavailableError> =>
  Effect.suspend(() => {
    if (!isPaymentsEnabled(env)) return Effect.fail(new PaymentsUnavailableError({ reason: 'PAYMENTS_ENABLED≠true' }));
    const name = (env.PAYMENT_PROVIDER ?? 'mock').toLowerCase();
    if (name === 'stripe') {
      const secretKey = env.STRIPE_SECRET_KEY ?? '';
      const webhookSecret = env.STRIPE_WEBHOOK_SECRET ?? '';
      if (!secretKey || !webhookSecret) return Effect.fail(new PaymentsUnavailableError({ reason: 'STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET manquants' }));
      return Effect.succeed(makeStripeProvider({ client: makeStripeClient(secretKey), webhookSecret }));
    }
    if (name !== 'mock') return Effect.fail(new PaymentsUnavailableError({ reason: `fournisseur inconnu « ${name} »` }));
    if (env.NODE_ENV === 'production' && env.PAYMENTS_ALLOW_MOCK !== 'true') return Effect.fail(new PaymentsUnavailableError({ reason: 'fournisseur mock interdit en production' }));
    return Effect.succeed(makeMockProvider(env.PAYMENTS_MOCK_SECRET || 'polyweb-mock-secret'));
  });

export const gatewayOf = (provider: PaymentProvider): PaymentGatewayShape => ({ provider: Effect.succeed(provider) });

export const PaymentGatewayLive = Layer.effect(PaymentGateway)(
  Effect.map(Effect.cached(providerFromEnv(process.env)), (provider) => ({ provider })),
);
