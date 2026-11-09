/**
 * Réaction du domaine forums aux remboursements génériques (`src/core/refunds`, docs/refunds.md).
 *
 * Objet de paiement `forums` : une référence `forums:<id>` (core/payments) rattache le
 * paiement à une ligne `forums`. `validate` s'exécute AVANT l'appel fournisseur, dans la
 * transaction qui verrouille le paiement ; `onSucceeded` DANS celle qui constate le
 * remboursement (restock, annulation, avoir…). Une règle métier non satisfaite se journalise
 * sans échouer : l'argent est déjà rendu ; seule une `DbError` annule (webhook rejoué).
 * À enregistrer au démarrage (`src/core/modules/bootstrap.ts`).
 */
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { registerRefundHandler, RefundNotAllowedError, type RefundOutcome, type RefundValidation } from "@/core/refunds";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { forums } from "./schema";

export const FORUMS_PAYMENT_PURPOSE = "forums";

/** Le sujet doit exister dans l'organisation du paiement (isolation tenant). */
const validateRefund = (tx: DbTransaction, input: RefundValidation) =>
  Effect.gen(function* () {
    const organizationId = input.payment.organizationId;
    if (!organizationId) return yield* Effect.fail(new RefundNotAllowedError({ paymentId: input.payment.id, reason: "handler", detail: "paiement sans organisation" }));
    const rows = yield* dbTry("forums.refund.validate", () =>
      tx.select({ id: forums.id }).from(forums).where(and(eq(forums.id, input.subjectId), eq(forums.organizationId, organizationId))).limit(1),
    );
    if (!rows[0]) return yield* Effect.fail(new RefundNotAllowedError({ paymentId: input.payment.id, reason: "not_found", detail: "forums inconnu dans cette organisation" }));
  });

/** Réaction métier au remboursement constaté — à compléter (restock, annulation…). */
const onRefundSucceeded = (_tx: DbTransaction, outcome: RefundOutcome) =>
  Effect.logInfo("[forums] remboursement constaté", { refundId: outcome.refund.id, subjectId: outcome.subjectId, fullyRefunded: outcome.fullyRefunded });

export const registerForumsRefunds = () =>
  registerRefundHandler({ purpose: FORUMS_PAYMENT_PURPOSE, validate: validateRefund, onSucceeded: onRefundSucceeded });
