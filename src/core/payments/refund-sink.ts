/**
 * Point d'entrée des événements de remboursement fournisseur (`kind = 'refund'`).
 * core/payments ne dépend pas de core/refunds : celui-ci s'y branche au démarrage
 * (`setRefundEventSink`, appelé par core/refunds). Sans brique branchée, l'événement est
 * journalisé et ignoré (réponse 200 : le fournisseur ne réessaie pas indéfiniment).
 */
import { Effect } from 'effect';
import type { DbError } from '@/lib/effect/errors';
import type { PaymentProvider, VerifiedPaymentEvent } from './provider';

export type RefundEventOutcome = 'applied' | 'unchanged' | 'duplicate' | 'unmatched';
export type RefundEventSink = (provider: PaymentProvider, event: VerifiedPaymentEvent) => Effect.Effect<RefundEventOutcome, DbError>;

let sink: RefundEventSink | null = null;

export const setRefundEventSink = (next: RefundEventSink): void => {
  sink = next;
};

export const dispatchRefundEvent = (provider: PaymentProvider, event: VerifiedPaymentEvent): Effect.Effect<RefundEventOutcome | 'ignored', DbError> =>
  sink ? sink(provider, event) : Effect.logWarning('[payments] événement de remboursement sans core/refunds branché', event.type).pipe(Effect.as('ignored' as const));
