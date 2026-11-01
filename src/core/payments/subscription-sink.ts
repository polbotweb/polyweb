/**
 * Point d'entrée des événements d'abonnement fournisseur (`kind = 'subscription'`).
 * Même schéma que `refund-sink.ts` : core/payments ne dépend d'aucun module ; le module
 * subscriptions s'y branche au démarrage (`setSubscriptionEventSink`). L'idempotence est celle,
 * générique, de core/payments : la trace `payment_events (provider, event_id)` est insérée par
 * le récepteur dans la transaction de son effet métier (`recordPaymentEvent`) — aucune table
 * propre aux abonnements. Sans récepteur branché : événement journalisé et ignoré (réponse 200).
 */
import { Effect } from 'effect';
import type { DbError } from '@/lib/effect/errors';
import type { PaymentProvider, VerifiedPaymentEvent } from './provider';

export type SubscriptionEventOutcome = 'applied' | 'unchanged' | 'duplicate' | 'unmatched';
/** Le récepteur journalise ses refus métier ; seule une `DbError` remonte (webhook rejoué par le fournisseur). */
export type SubscriptionEventSink = (provider: PaymentProvider, event: VerifiedPaymentEvent) => Effect.Effect<SubscriptionEventOutcome, DbError>;

let sink: SubscriptionEventSink | null = null;

export const setSubscriptionEventSink = (next: SubscriptionEventSink): void => {
  sink = next;
};

export const dispatchSubscriptionEvent = (provider: PaymentProvider, event: VerifiedPaymentEvent): Effect.Effect<SubscriptionEventOutcome | 'ignored', DbError> =>
  sink ? sink(provider, event) : Effect.logWarning('[payments] événement d\'abonnement sans module subscriptions branché', event.type).pipe(Effect.as('ignored' as const));
