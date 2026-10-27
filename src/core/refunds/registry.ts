/**
 * Registre des réactions de modules aux remboursements, indexé par `purpose` de la référence
 * de paiement (`<purpose>:<subjectId>`, core/payments).
 *
 * - `validate` : contrôle métier AVANT l'appel fournisseur, dans la transaction qui verrouille
 *   le paiement (ex. Sales : montant atteignable par un avoir). Un refus annule la demande.
 * - `onSucceeded` / `onFailed` : réaction DANS la transaction qui constate l'issue (restock,
 *   annulation, avoir…). Comme pour core/payments, une règle métier non satisfaite se
 *   journalise sans échouer ; seule une `DbError` annule (et le webhook est rejoué).
 */
import type { Effect } from 'effect';
import type { Payment } from '@database/schemas/payments.schema';
import type { Refund } from '@database/schemas/refunds.schema';
import type { Money } from '@/core/money';
import { isValidPurpose } from '@/core/payments';
import type { DbError } from '@/lib/effect/errors';
import type { DbTransaction } from '@/lib/effect/transaction';
import type { RefundNotAllowedError } from './errors';

export interface RefundValidation {
  readonly payment: Payment;
  readonly subjectId: string;
  readonly amount: Money;
  /** Déjà remboursé (`succeeded`) + en cours (`pending`), même devise. */
  readonly committed: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RefundOutcome {
  readonly refund: Refund;
  readonly payment: Payment;
  readonly subjectId: string;
  /** Total `succeeded` du paiement, ce remboursement compris. */
  readonly totalRefunded: number;
  readonly fullyRefunded: boolean;
}

export interface RefundHandler {
  readonly purpose: string;
  readonly validate?: (tx: DbTransaction, input: RefundValidation) => Effect.Effect<void, RefundNotAllowedError | DbError>;
  readonly onSucceeded?: (tx: DbTransaction, outcome: RefundOutcome) => Effect.Effect<void, DbError>;
  readonly onFailed?: (tx: DbTransaction, outcome: RefundOutcome) => Effect.Effect<void, DbError>;
}

const registry = new Map<string, RefundHandler>();

/** Enregistre (ou remplace, pour le rechargement à chaud) la réaction d'un objet de paiement. */
export const registerRefundHandler = (handler: RefundHandler): void => {
  if (!isValidPurpose(handler.purpose)) throw new Error(`Objet de paiement invalide : ${handler.purpose}`);
  registry.set(handler.purpose, handler);
};

export const refundHandler = (purpose: string): RefundHandler | undefined => registry.get(purpose);

export const registeredRefundPurposes = (): readonly string[] => [...registry.keys()].sort();
