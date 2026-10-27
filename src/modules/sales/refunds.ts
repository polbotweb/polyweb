/**
 * Réaction des factures aux remboursements core/refunds (objet `sales-invoice`).
 *
 * - `validate` (avant l'appel fournisseur) : facture du même tenant, créditable, montant dans le
 *   restant créditable et encaissé, et atteignable EXACTEMENT par un avoir (arrondi de TVA).
 * - Remboursement réussi → avoir émis (numéroté) + encaissement négatif `card` (référence =
 *   remboursement), dans la transaction qui constate le succès. Idempotent par référence.
 * - Remboursement non atteignable (ex. initié depuis le tableau de bord du fournisseur) : avoir
 *   laissé en brouillon et anomalie journalisée ; jamais d'échec (l'argent est déjà rendu).
 */
import { Effect } from 'effect';
import { registerRefundHandler, RefundNotAllowedError, type RefundOutcome, type RefundValidation } from '@/core/refunds';
import type { DbTransaction } from '@/lib/effect/transaction';
import { SALES_PAYMENT_PURPOSE } from './payments';
import { checkRefundCredit, issueRefundCreditNote, salesToday } from './services/salesDocument.service';

const validateRefund = (tx: DbTransaction, input: RefundValidation) =>
  Effect.gen(function* () {
    const deny = (detail: string) => new RefundNotAllowedError({ paymentId: input.payment.id, reason: 'handler', detail });
    const check = yield* checkRefundCredit(tx, input.subjectId, input.amount.amountMinor).pipe(
      Effect.catch((e) => (e._tag === 'DbError' ? Effect.fail(e) : Effect.succeed({ ok: false as const, reason: 'pricing' }))),
    );
    if (!check.ok) return yield* deny(check.reason);
    if (check.invoice.organizationId !== input.payment.organizationId) return yield* deny('tenant');
    if (check.invoice.currency.toUpperCase() !== input.amount.currency) return yield* deny('currency');
  });

const creditRefunded = (tx: DbTransaction, outcome: RefundOutcome) => {
  const today = salesToday();
  return issueRefundCreditNote(tx, outcome.subjectId, {
    amountMinor: outcome.refund.amount, refundId: outcome.refund.id, authorId: outcome.refund.requestedBy, paidAt: (outcome.refund.succeededAt ?? new Date()).toISOString().slice(0, 10),
  }, today).pipe(
    Effect.flatMap((result) => (result.issued || result.duplicate
      ? Effect.void
      : Effect.logError('[sales] remboursement non atteignable par un avoir exact — avoir brouillon à ajuster', { refundId: outcome.refund.id, invoiceId: outcome.subjectId, creditNoteId: result.creditNote?.id }))),
    Effect.catch((e) => (e._tag === 'DbError' ? Effect.fail(e) : Effect.logError('[sales] avoir de remboursement impossible — à traiter', { refundId: outcome.refund.id, invoiceId: outcome.subjectId, error: e }))),
  );
};

export const registerSalesRefunds = () => registerRefundHandler({ purpose: SALES_PAYMENT_PURPOSE, validate: validateRefund, onSucceeded: creditRefunded });
