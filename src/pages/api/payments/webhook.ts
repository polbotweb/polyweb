/**
 * Webhook fournisseur de paiement (repris d'atlaselle) : signature → idempotence → montants.
 * 200 après traitement ; 400 signature invalide ; 422 montant incohérent ; 500 échec
 * (le fournisseur réessaie, le traitement est idempotent) ; événement valide non géré = 200.
 */
import { Effect } from 'effect';
import { apiRoute } from '@/lib/effect/http';
import { selectPaymentProvider, UnhandledWebhookError } from '@/modules/payments/domain/providers';
import { applyProviderEventEffect, isPaymentsEnabled } from '@/modules/payments/domain/payment-service';

export const prerender = false;
const text = (body: string, status: number) => new Response(body, { status });

export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    if (!isPaymentsEnabled()) return text('Not Found', 404);
    const provider = yield* Effect.try(() => selectPaymentProvider()).pipe(Effect.option);
    if (provider._tag === 'None') return text('Not Found', 404);
    const p = provider.value;
    const rawBody = yield* Effect.promise(() => request.text());
    const signature = request.headers.get(p.name === 'stripe' ? 'stripe-signature' : 'x-polyweb-mock-signature');
    const verified = yield* Effect.tryPromise(() => p.verifyWebhook(rawBody, signature)).pipe(Effect.result);
    if (verified._tag === 'Failure') {
      return verified.failure.cause instanceof UnhandledWebhookError ? text('OK', 200) : text('Bad Request', 400);
    }
    const applied = yield* applyProviderEventEffect(verified.success).pipe(Effect.result);
    if (applied._tag === 'Failure') {
      const err = applied.failure;
      if (err._tag === 'PaymentAmountMismatchError') {
        yield* Effect.logError('[payments]', err.message);
        return text('Unprocessable Entity', 422);
      }
      yield* Effect.logError('[payments] Webhook processing failed', err);
      return text('Internal Server Error', 500);
    }
    return text('OK', 200);
  }),
);
