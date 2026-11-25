/**
 * Flux bancaires automatiques (D3), purs : interface `BankFeedProvider` commune à tous les
 * agrégateurs DSP2 / open banking, et conversion des transactions GoCardless Bank Account Data
 * (ex-Nordigen, API v2) vers le modèle commun des relevés. Le client HTTP est dans
 * `services/feeds.service.ts` (simple `fetch`, aucune dépendance, injectable en test).
 */
import { Effect } from "effect";
import { StatementParseError } from "./errors";
import { transaction, type ParsedTransaction } from "./parsers/types";
import { canonicalAmount, cleanText, decimalToMinor, endToEndOrNull, exponentOf, ibanOrNull, isoDateTime, nullableText } from "./parsers/values";

/** Identifiants d'accès propres à l'organisation (jamais journalisés, stockés scellés). */
export interface FeedCredentials {
  readonly secretId: string;
  readonly secretKey: string;
}

export interface FeedInstitution { readonly id: string; readonly name: string; readonly bic: string | null; readonly maxHistoryDays: number | null }

export interface FeedLinkRequest {
  readonly institutionId: string;
  readonly redirectUrl: string;
  readonly reference: string;
  readonly historyDays: number;
  readonly language: string;
}

export interface FeedLink { readonly requisitionId: string; readonly link: string; readonly agreementExpiresAt: string | null }

export interface FeedAccount { readonly id: string; readonly iban: string | null; readonly currency: string | null; readonly name: string | null }

export interface FeedProviderError { readonly _tag: "FeedProviderError"; readonly status: number | null; readonly detail: string }

/** Interface d'un agrégateur (GoCardless ; Bridge, Powens, Enable Banking se brancheraient ici). */
export interface BankFeedProvider {
  readonly key: string;
  readonly institutions: (credentials: FeedCredentials, country: string) => Effect.Effect<readonly FeedInstitution[], FeedProviderError>;
  readonly createLink: (credentials: FeedCredentials, request: FeedLinkRequest) => Effect.Effect<FeedLink, FeedProviderError>;
  readonly linkedAccounts: (credentials: FeedCredentials, requisitionId: string) => Effect.Effect<{ readonly status: "pending" | "linked" | "expired" | "error"; readonly accounts: readonly FeedAccount[] }, FeedProviderError>;
  readonly transactions: (credentials: FeedCredentials, accountId: string, from: string, to: string) => Effect.Effect<{ readonly booked: readonly unknown[]; readonly pending: readonly unknown[] }, FeedProviderError>;
}

/** Statuts de réquisition GoCardless → statut du flux. */
export const gocardlessStatus = (status: string): "pending" | "linked" | "expired" | "error" => {
  switch (status) {
    case "LN": return "linked";
    case "EX": case "SU": return "expired";
    case "RJ": return "error";
    default: return "pending";
  }
};

type Json = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" ? value : "");
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? value as Json : {});

/** Transaction GoCardless (`booked` ou `pending`) → ligne de relevé. */
export const gocardlessTransaction = (raw: unknown, provisional: boolean): Effect.Effect<ParsedTransaction, StatementParseError> =>
  Effect.gen(function* () {
    const tx = obj(raw);
    const amount = obj(tx.transactionAmount);
    const currency = str(amount.currency).toUpperCase();
    const exponent = exponentOf(currency);
    if (exponent === null) return yield* new StatementParseError({ format: "camt053", reason: "currency", detail: `flux : ${currency || "devise absente"}` });
    const canonical = canonicalAmount(str(amount.amount), ".");
    const minor = canonical === null ? null : decimalToMinor(canonical, exponent);
    if (minor === null) return yield* new StatementParseError({ format: "camt053", reason: "amount", detail: `flux : ${str(amount.amount)}` });
    const bookingDate = isoDateTime(str(tx.bookingDate) || str(tx.bookingDateTime) || str(tx.valueDate));
    if (!bookingDate) return yield* new StatementParseError({ format: "camt053", reason: "date", detail: "flux : date absente" });
    const credit = minor >= 0;
    const unstructured = Array.isArray(tx.remittanceInformationUnstructuredArray) ? (tx.remittanceInformationUnstructuredArray as unknown[]).map(str).join(" ") : str(tx.remittanceInformationUnstructured);
    const name = nullableText(credit ? str(tx.debtorName) : str(tx.creditorName), 140);
    const exchange = Array.isArray(tx.currencyExchange) ? obj((tx.currencyExchange as unknown[])[0]) : obj(tx.currencyExchange);
    const instructed = obj(exchange.instructedAmount);
    const originalCurrency = str(instructed.currency || exchange.sourceCurrency).toUpperCase() || null;
    const originalExponent = originalCurrency ? exponentOf(originalCurrency) : null;
    const originalCanonical = originalExponent !== null ? canonicalAmount(str(instructed.amount), ".") : null;
    const originalMinor = originalCanonical !== null && originalExponent !== null ? decimalToMinor(originalCanonical, originalExponent) : null;
    const e2e = endToEndOrNull(str(tx.endToEndId));
    const structured = nullableText(str(tx.remittanceInformationStructured), 35);
    return transaction({
      bookingDate, valueDate: isoDateTime(str(tx.valueDate) || str(tx.valueDateTime)), amountMinor: minor, currency,
      originalAmountMinor: originalMinor !== null && originalCurrency !== currency ? (credit ? Math.abs(originalMinor) : -Math.abs(originalMinor)) : null,
      originalCurrency: originalMinor !== null && originalCurrency !== currency ? originalCurrency : null,
      label: cleanText([unstructured, str(tx.additionalInformation)].filter(Boolean).join(" ")) || name || (credit ? "Crédit" : "Débit"),
      counterpartyName: name, counterpartyIban: ibanOrNull(str(obj(credit ? tx.debtorAccount : tx.creditorAccount).iban)),
      endToEndId: e2e,
      bankReference: nullableText(str(tx.transactionId) || str(tx.internalTransactionId) || str(tx.entryReference), 64),
      references: [e2e, structured, nullableText(str(tx.mandateId), 35)].filter((v): v is string => !!v),
      bankCode: nullableText(str(tx.bankTransactionCode) || str(tx.proprietaryBankTransactionCode), 35),
      provisional,
    });
  });
