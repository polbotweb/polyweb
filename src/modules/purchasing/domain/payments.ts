/** Règlements fournisseurs : pas de trop-perçu, méthodes alignées sur les ventes. */
import { Effect } from "effect";
import { InvalidInvoiceError } from "./errors";
import { invoiceAmountDue, OPEN_INVOICE_STATUSES, type SupplierInvoiceStatus } from "./invoice";
import { PAYMENT_METHODS, type PaymentMethod } from "@/modules/sales/domain/payments";

export { PAYMENT_METHODS, type PaymentMethod };

export const validateSupplierPayment = (
  status: SupplierInvoiceStatus,
  balance: { readonly grossMinor: number; readonly paidMinor: number; readonly creditedMinor: number },
  amountMinor: number,
  method: string,
): Effect.Effect<{ amountMinor: number; method: PaymentMethod }, InvalidInvoiceError> =>
  Effect.gen(function* () {
    if (!(OPEN_INVOICE_STATUSES as readonly string[]).includes(status)) {
      return yield* new InvalidInvoiceError({ field: "status", value: status });
    }
    if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
      return yield* new InvalidInvoiceError({ field: "method", value: method });
    }
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      return yield* new InvalidInvoiceError({ field: "amount", value: String(amountMinor) });
    }
    if (amountMinor > invoiceAmountDue(balance)) {
      return yield* new InvalidInvoiceError({ field: "amount", value: "overpayment" });
    }
    return { amountMinor, method: method as PaymentMethod };
  });
