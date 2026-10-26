/**
 * Encaissements (purs) : statut de paiement d'une facture et restant dû, en tenant compte
 * des avoirs émis. Pas de trop-perçu : un paiement ne peut dépasser le restant dû.
 */
import { Effect } from "effect";
import { InvalidPaymentError } from "./errors";
import type { SalesStatus } from "./workflow";

export const PAYMENT_METHODS = ["bank_transfer", "card", "cash", "check", "direct_debit", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface InvoiceBalanceInput {
  readonly grossMinor: number;
  readonly paidMinor: number;
  readonly creditedMinor: number;
}

/** Restant dû (jamais négatif). */
export const amountDue = (input: InvoiceBalanceInput) => Math.max(0, input.grossMinor - input.paidMinor - input.creditedMinor);

/** Statut d'une facture émise d'après encaissements et avoirs. */
export const invoiceStatusFromBalance = (input: InvoiceBalanceInput): SalesStatus => {
  if (input.creditedMinor >= input.grossMinor && input.grossMinor > 0) return "CREDITED";
  if (amountDue(input) === 0) return input.paidMinor > 0 ? "PAID" : "CREDITED";
  return input.paidMinor > 0 ? "PARTIALLY_PAID" : "ISSUED";
};

/** Valide un encaissement : montant > 0, facture ouverte, sans dépasser le restant dû. */
export const validatePayment = (status: SalesStatus, balance: InvoiceBalanceInput, amountMinor: number): Effect.Effect<number, InvalidPaymentError> => {
  if (status !== "ISSUED" && status !== "PARTIALLY_PAID") return Effect.fail(new InvalidPaymentError({ reason: "status", value: status }));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return Effect.fail(new InvalidPaymentError({ reason: "non-positive", value: String(amountMinor) }));
  if (amountMinor > amountDue(balance)) return Effect.fail(new InvalidPaymentError({ reason: "overpayment", value: String(amountMinor) }));
  return Effect.succeed(amountMinor);
};
