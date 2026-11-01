/**
 * Réaction du domaine subscriptions aux remboursements génériques (`src/core/refunds`, docs/refunds.md).
 *
 * Objet de paiement `subscriptions` : une référence `subscriptions:<id>` (core/payments) rattache le
 * paiement à une ligne `subscriptions`. `validate` s'exécute AVANT l'appel fournisseur, dans la
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
import { subscriptions } from "./schema";

export const SUBSCRIPTIONS_PAYMENT_PURPOSE = "subscriptions";

/** Le sujet doit exister dans l'organisation du paiement (isolation tenant). */
const validateRefund = (tx: DbTransaction, input: RefundValidation) =>
  Effect.gen(function* () {
    const organizationId = input.payment.organizationId;
    if (!organizationId) return yield* Effect.fail(new RefundNotAllowedError({ paymentId: input.payment.id, reason: "handler", detail: "paiement sans organisation" }));
    const rows = yield* dbTry("subscriptions.refund.validate", () =>
      tx.select({ id: subscriptions.id }).from(subscriptions).where(and(eq(subscriptions.id, input.subjectId), eq(subscriptions.organizationId, organizationId))).limit(1),
    );
    if (!rows[0]) return yield* Effect.fail(new RefundNotAllowedError({ paymentId: input.payment.id, reason: "not_found", detail: "subscriptions inconnu dans cette organisation" }));
  });

/** Réaction métier au remboursement constaté — à compléter (restock, annulation…). */
const onRefundSucceeded = (_tx: DbTransaction, outcome: RefundOutcome) =>
  Effect.logInfo("[subscriptions] remboursement constaté", { refundId: outcome.refund.id, subjectId: outcome.subjectId, fullyRefunded: outcome.fullyRefunded });

export const registerSubscriptionsRefunds = () =>
  registerRefundHandler({ purpose: SUBSCRIPTIONS_PAYMENT_PURPOSE, validate: validateRefund, onSucceeded: onRefundSucceeded });
