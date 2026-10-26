/** Schémas de numérotation par défaut (core/numbering) : factures et avoirs sans trou, remise annuelle. */
import type { NumberingScheme } from "@/core/numbering";
import type { SalesDocumentKind } from "./workflow";

export const SALES_NUMBERING_KEYS: Record<SalesDocumentKind, string> = {
  quote: "sales.quote",
  invoice: "sales.invoice",
  credit_note: "sales.credit_note",
};

export const DEFAULT_SALES_NUMBERING: Record<SalesDocumentKind, NumberingScheme> = {
  quote: { pattern: "{prefix}-{YYYY}-{seq:4}", reset: "yearly", prefix: "DEV" },
  invoice: { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "FA" },
  credit_note: { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "AV" },
};

/** Statut auquel le numéro définitif est attribué (devis : à l'envoi ; facture/avoir : à l'émission). */
export const NUMBERED_AT: Record<SalesDocumentKind, "SENT" | "ISSUED"> = { quote: "SENT", invoice: "ISSUED", credit_note: "ISSUED" };
