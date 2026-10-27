/** Erreurs typées de core/refunds (aucune ne contient de secret ni de donnée de carte). */
import { Data } from 'effect';

/** Paiement introuvable, hors tenant, ou dans un état non remboursable. */
export class RefundNotAllowedError extends Data.TaggedError('RefundNotAllowedError')<{
  readonly paymentId: string;
  readonly reason: 'not_found' | 'status' | 'currency' | 'amount' | 'handler';
  readonly detail?: string;
}> {
  get message() {
    return `Remboursement refusé (${this.reason}${this.detail ? ` : ${this.detail}` : ''})`;
  }
}

/** Le montant demandé dépasse le reste remboursable (capturé − remboursé − en cours). */
export class RefundAmountExceededError extends Data.TaggedError('RefundAmountExceededError')<{
  readonly requested: number;
  readonly available: number;
  readonly currency: string;
}> {
  get message() {
    return `Montant de remboursement ${this.requested} > reste remboursable ${this.available} ${this.currency}`;
  }
}

/** Clé d'idempotence déjà utilisée pour une demande différente (autre paiement ou montant). */
export class RefundIdempotencyConflictError extends Data.TaggedError('RefundIdempotencyConflictError')<{ readonly idempotencyKey: string }> {
  get message() {
    return 'Clé d’idempotence de remboursement déjà utilisée pour une autre demande';
  }
}
