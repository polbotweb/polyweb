/**
 * Factures et avoirs fournisseurs : statuts, échéance, restant dû.
 * Le rapprochement (matching.ts) et les règlements (payments.ts) dérivent les statuts payés / crédités.
 */
export const SUPPLIER_INVOICE_KINDS = ["invoice", "credit_note"] as const;
export type SupplierInvoiceKind = (typeof SUPPLIER_INVOICE_KINDS)[number];

export const SUPPLIER_INVOICE_STATUSES = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CREDITED", "CANCELLED"] as const;
export type SupplierInvoiceStatus = (typeof SUPPLIER_INVOICE_STATUSES)[number];

export const EDITABLE_INVOICE_STATUSES: readonly SupplierInvoiceStatus[] = ["DRAFT"];
export const OPEN_INVOICE_STATUSES: readonly SupplierInvoiceStatus[] = ["ISSUED", "PARTIALLY_PAID"];

export const invoiceAmountDue = (input: { readonly grossMinor: number; readonly paidMinor: number; readonly creditedMinor: number }) =>
  Math.max(0, input.grossMinor - input.paidMinor - input.creditedMinor);

export const invoiceStatusFromBalance = (input: { readonly grossMinor: number; readonly paidMinor: number; readonly creditedMinor: number }): SupplierInvoiceStatus => {
  if (input.creditedMinor >= input.grossMinor && input.grossMinor > 0) return "CREDITED";
  if (invoiceAmountDue(input) === 0) return input.paidMinor > 0 ? "PAID" : "CREDITED";
  return input.paidMinor > 0 ? "PARTIALLY_PAID" : "ISSUED";
};
