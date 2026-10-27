/**
 * Registre des objets de paiement (`purpose`) : chaque module propriétaire enregistre ses
 * réactions (payé, échoué, expiré, remboursé). Elles s'exécutent DANS la transaction qui
 * applique l'événement fournisseur : l'effet métier et la trace d'idempotence sont
 * validés ou annulés ensemble. Une règle métier non satisfaite (ex. facture déjà soldée)
 * ne doit pas échouer — journaliser et réussir — sinon le fournisseur réessaierait sans fin ;
 * seule une erreur base (`DbError`) annule et provoque un nouvel essai.
 */
import type { Effect } from 'effect';
import type { Payment } from '@database/schemas/payments.schema';
import type { DbError } from '@/lib/effect/errors';
import type { DbTransaction } from '@/lib/effect/transaction';
import { isValidPurpose } from './reference';

export type PaymentReaction = (tx: DbTransaction, payment: Payment, subjectId: string) => Effect.Effect<void, DbError>;

export interface PaymentPurposeHandler {
  readonly purpose: string;
  readonly onSucceeded?: PaymentReaction;
  readonly onFailed?: PaymentReaction;
  readonly onExpired?: PaymentReaction;
  readonly onRefunded?: PaymentReaction;
}

const registry = new Map<string, PaymentPurposeHandler>();

/** Enregistre (ou remplace, pour le rechargement à chaud) le gestionnaire d'un objet. */
export const registerPaymentPurpose = (handler: PaymentPurposeHandler): void => {
  if (!isValidPurpose(handler.purpose)) throw new Error(`Objet de paiement invalide : ${handler.purpose}`);
  registry.set(handler.purpose, handler);
};

export const paymentPurpose = (purpose: string): PaymentPurposeHandler | undefined => registry.get(purpose);

export const registeredPaymentPurposes = (): readonly string[] => [...registry.keys()].sort();
