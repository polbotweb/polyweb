/** Numérotation (core/numbering) : BC, BR, factures, avoirs, retours, lots SEPA ; sans trou, remise annuelle. */
import type { NumberingScheme } from "@/core/numbering";

export const PURCHASE_ORDER_NUMBERING_KEY = "purchasing.order";
export const DEFAULT_PURCHASE_ORDER_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "BC" };
export const GOODS_RECEIPT_NUMBERING_KEY = "purchasing.receipt";
export const DEFAULT_GOODS_RECEIPT_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "BR" };
export const SUPPLIER_INVOICE_NUMBERING_KEY = "purchasing.invoice";
export const DEFAULT_SUPPLIER_INVOICE_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "FF" };
export const SUPPLIER_CREDIT_NUMBERING_KEY = "purchasing.credit_note";
export const DEFAULT_SUPPLIER_CREDIT_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "AF" };
export const SUPPLIER_RETURN_NUMBERING_KEY = "purchasing.return";
export const DEFAULT_SUPPLIER_RETURN_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "RF" };
export const SEPA_EXPORT_NUMBERING_KEY = "purchasing.sepa";
export const DEFAULT_SEPA_EXPORT_NUMBERING: NumberingScheme = { pattern: "{prefix}-{YYYY}-{seq:5}", reset: "yearly", prefix: "SEPA" };

export const schemeWithPrefix = (base: NumberingScheme, prefix: string): NumberingScheme => ({ ...base, prefix });
