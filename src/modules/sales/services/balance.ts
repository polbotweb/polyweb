/**
 * Point unique de mise à jour du solde d'une facture (encaissement, remboursement, avoir).
 * Recalcule le statut et, si la facture devient soldée (`PAID`), enregistre `invoice.paid`
 * dans l'outbox de la même transaction : un seul émetteur, quel que soit le chemin
 * (saisie manuelle, lien de paiement, facture fournisseur de paiement, remboursement).
 */
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { recordEvent } from "@/core/events/outbox";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { serializeSalesDocument } from "../api/public-api";
import { invoiceStatusFromBalance } from "../domain/payments";
import { sales } from "../schema";

type InvoiceRow = typeof sales.$inferSelect;

export const applyInvoiceBalance = (
  tx: DbTransaction,
  invoice: InvoiceRow,
  change: { readonly paidMinor?: number; readonly creditedMinor?: number },
  operation: string,
) =>
  Effect.gen(function* () {
    const paidMinor = change.paidMinor ?? invoice.paidMinor;
    const creditedMinor = change.creditedMinor ?? invoice.creditedMinor;
    const status = invoiceStatusFromBalance({ grossMinor: invoice.grossMinor, paidMinor, creditedMinor });
    const [row] = yield* dbTry(operation, () => tx.update(sales).set({ paidMinor, creditedMinor, status }).where(eq(sales.id, invoice.id)).returning());
    if (row.kind === "invoice" && row.status === "PAID" && invoice.status !== "PAID") {
      yield* recordEvent(tx, "invoice.paid", serializeSalesDocument(row), { organizationId: row.organizationId });
    }
    return row;
  });
