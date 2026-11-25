/**
 * Dédoublonnage et continuité des relevés (B3), purs :
 * - empreinte de ligne unique par compte : référence forte de la banque (AcctSvcrRef, FITID,
 *   numéro d'écriture) si présente, sinon date comptable, date de valeur, montant, devise, libellé
 *   normalisé et rang parmi les lignes identiques du fichier (deux virements identiques le même
 *   jour restent deux lignes ; le même fichier réimporté ne double rien) ;
 * - fusion d'une ligne provisoire (CAMT.052 / .054, MT942) dans la définitive ;
 * - continuité : solde d'ouverture = solde de clôture précédent, cohérence interne du relevé.
 */
import { createHash } from "node:crypto";
import { daysBetween, normalizeReference } from "@/core/reconciliation/normalize";
import type { ContinuityStatus } from "./constants";
import type { ParsedStatement, ParsedTransaction } from "./parsers/types";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

/** Libellé normalisé pour l'empreinte (casse, accents, espaces et ponctuation neutralisés). */
export const normalizeLabel = (label: string) => normalizeReference(label).slice(0, 120);

/** Clé faible (sans référence banque), commune aux lignes « identiques ». */
const weakKey = (tx: ParsedTransaction) => [tx.bookingDate, tx.valueDate ?? "", tx.amountMinor, tx.currency, normalizeLabel(tx.label)].join("|");

/** Empreintes des lignes d'un fichier, dans l'ordre (rang calculé par clé faible). */
export const fingerprints = (accountId: string, transactions: readonly ParsedTransaction[]): string[] => {
  const ranks = new Map<string, number>();
  return transactions.map((tx) => {
    const strong = tx.bankReference ?? null;
    if (strong) return sha(`${accountId}|ref|${tx.currency}|${strong}|${tx.amountMinor}`);
    const key = weakKey(tx);
    const rank = (ranks.get(key) ?? 0) + 1;
    ranks.set(key, rank);
    return sha(`${accountId}|weak|${key}|${rank}`);
  });
};

/** Une ligne provisoire déjà en base peut-elle être remplacée par cette ligne définitive ? */
export const matchesProvisional = (
  definitive: Pick<ParsedTransaction, "amountMinor" | "currency" | "bookingDate" | "endToEndId" | "bankReference" | "label">,
  provisional: { readonly amountMinor: number; readonly currency: string; readonly bookingDate: string; readonly endToEndId: string | null; readonly bankReference: string | null; readonly label: string },
): boolean => {
  if (definitive.amountMinor !== provisional.amountMinor || definitive.currency !== provisional.currency) return false;
  const gap = daysBetween(definitive.bookingDate, provisional.bookingDate);
  if (gap === null || gap > 3) return false;
  if (definitive.bankReference && provisional.bankReference) return definitive.bankReference === provisional.bankReference;
  if (definitive.endToEndId && provisional.endToEndId) return definitive.endToEndId === provisional.endToEndId;
  return normalizeLabel(definitive.label) === normalizeLabel(provisional.label);
};

export interface ContinuityResult {
  readonly status: ContinuityStatus;
  /** Écart constaté (unités mineures) : ouverture − clôture précédente, ou incohérence interne. */
  readonly deltaMinor: number;
  readonly reason: "ok" | "no_balance" | "opening_mismatch" | "internal_mismatch" | "sequence_gap" | "first";
}

/**
 * Contrôle d'un relevé définitif contre le précédent du même compte (null = premier relevé, comparé
 * au solde d'ouverture du compte si connu).
 */
export const checkContinuity = (
  statement: Pick<ParsedStatement, "openingBalanceMinor" | "closingBalanceMinor" | "sequence" | "kind"> & { readonly transactions: readonly Pick<ParsedTransaction, "amountMinor" | "provisional">[] },
  previous: { readonly closingBalanceMinor: number | null; readonly sequence: string | null } | null,
): ContinuityResult => {
  if (statement.kind !== "statement") return { status: "unknown", deltaMinor: 0, reason: "no_balance" };
  if (statement.openingBalanceMinor === null || statement.closingBalanceMinor === null) return { status: "unknown", deltaMinor: 0, reason: "no_balance" };
  const movements = statement.transactions.reduce((sum, tx) => sum + tx.amountMinor, 0);
  const internal = statement.openingBalanceMinor + movements - statement.closingBalanceMinor;
  if (internal !== 0) return { status: "mismatch", deltaMinor: internal, reason: "internal_mismatch" };
  if (!previous || previous.closingBalanceMinor === null) return { status: previous ? "unknown" : "ok", deltaMinor: 0, reason: "first" };
  const delta = statement.openingBalanceMinor - previous.closingBalanceMinor;
  if (delta !== 0) return { status: "mismatch", deltaMinor: delta, reason: "opening_mismatch" };
  const prevSeq = previous.sequence ? Number(previous.sequence.split("/")[0]) : NaN;
  const seq = statement.sequence ? Number(statement.sequence.split("/")[0]) : NaN;
  if (Number.isInteger(prevSeq) && Number.isInteger(seq) && seq !== prevSeq + 1 && seq !== 1) return { status: "gap", deltaMinor: 0, reason: "sequence_gap" };
  return { status: "ok", deltaMinor: 0, reason: "ok" };
};

/** Identifiant de compte du fichier compatible avec le compte cible (IBAN, RIB français, numéro) ? */
export const accountMatches = (fileIdentifier: string | null, account: { readonly iban: string | null; readonly accountNumber?: string | null }): boolean => {
  if (!fileIdentifier) return true;
  const file = fileIdentifier.replace(/\s+/g, "").toUpperCase();
  const iban = (account.iban ?? "").replace(/\s+/g, "").toUpperCase();
  if (!iban && !account.accountNumber) return true;
  if (iban && file === iban) return true;
  // RIB français (banque + guichet + compte, 21 caractères) contenu dans l'IBAN FR.
  if (iban.startsWith("FR") && file.length >= 21 && iban.slice(4, 25) === file.slice(0, 21)) return true;
  if (account.accountNumber && file.endsWith(account.accountNumber.replace(/\s+/g, "").toUpperCase())) return true;
  return iban.length > 8 && (iban.endsWith(file) || file.endsWith(iban.slice(-11)));
};
