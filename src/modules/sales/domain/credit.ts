/**
 * Avoirs (purs) : un avoir référence une facture émise et ne peut dépasser le restant créditable
 * (TTC facture − avoirs déjà émis). Montants positifs ; le signe est porté par le type de document.
 */
import { Effect } from "effect";
import { CreditExceedsInvoiceError } from "./errors";
import type { SalesStatus } from "./workflow";

export const CREDITABLE_INVOICE_STATUSES: readonly SalesStatus[] = ["ISSUED", "PARTIALLY_PAID", "PAID"];

export const creditableAmount = (invoiceGrossMinor: number, alreadyCreditedMinor: number) => Math.max(0, invoiceGrossMinor - alreadyCreditedMinor);

export const validateCreditAmount = (input: { readonly invoiceGrossMinor: number; readonly alreadyCreditedMinor: number; readonly requestedMinor: number }) =>
  input.requestedMinor > 0 && input.requestedMinor <= creditableAmount(input.invoiceGrossMinor, input.alreadyCreditedMinor)
    ? Effect.succeed(input.requestedMinor)
    : Effect.fail(new CreditExceedsInvoiceError(input));
