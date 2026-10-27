/**
 * Webhook fournisseur de paiement (core/payments) : signature vérifiée sur le corps BRUT,
 * puis application idempotente (trace `payment_events`) dans une transaction.
 * 200 traité / doublon / non géré ; 400 signature ou corps invalide ; 404 paiements
 * désactivés ; 422 montant incohérent ; 500 échec (le fournisseur réessaie, sans risque).
 */
import { Effect } from 'effect';
import { apiRoute } from '@/lib/effect/http';
import { handleWebhook, isPaymentsEnabled } from '@/core/payments';

export const prerender = false;
const MAX_BODY_BYTES = 256 * 1024;
const text = (body: string, status: number) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    if (!isPaymentsEnabled()) return text('Not Found', 404);
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > MAX_BODY_BYTES) return text('Payload Too Large', 413);
    const rawBody = yield* Effect.promise(() => request.text());
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return text('Payload Too Large', 413);
    const outcome = yield* handleWebhook(rawBody, request.headers).pipe(Effect.result);
    if (outcome._tag === 'Success') return text('OK', 200);
    const err = outcome.failure;
    switch (err._tag) {
      case 'PaymentsUnavailableError':
        return text('Not Found', 404);
      case 'WebhookSignatureError':
        yield* Effect.logWarning('[payments] webhook rejeté', err.reason);
        return text('Bad Request', 400);
      case 'PaymentAmountMismatchError':
        yield* Effect.logError('[payments] montant incohérent', { expected: err.expected, received: err.received, currency: err.currency });
        return text('Unprocessable Entity', 422);
      default:
        yield* Effect.logError('[payments] échec du traitement du webhook', err);
        return text('Internal Server Error', 500);
    }
  }),
);
