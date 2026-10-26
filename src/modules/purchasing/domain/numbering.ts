/** Numérotation (core/numbering) : commandes à l'envoi, bons de réception à la saisie ; sans trou, remise annuelle. */
import type { NumberingScheme } from "@/core/numbering";

export const PURCHASE_ORDER_NUMBERING_KEY = "purchasing.order";
export const DEFAULT_PURCHASE_ORDER_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "BC" };
export const GOODS_RECEIPT_NUMBERING_KEY = "purchasing.receipt";
export const DEFAULT_GOODS_RECEIPT_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "BR" };
