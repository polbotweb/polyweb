/**
 * Modèle commun produit par tous les lecteurs de relevés (CAMT, MT940/942, CFONB 120, OFX, QIF, CSV).
 * Montants en unités mineures de la devise (entiers signés : > 0 crédit, < 0 débit), dates ISO.
 */
import type { StatementFormat, StatementKind } from "../constants";

export interface ParsedTransaction {
  readonly bookingDate: string;
  readonly valueDate: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  /** Montant d'origine (devise de l'instruction) quand elle diffère de la devise du compte. */
  readonly originalAmountMinor: number | null;
  readonly originalCurrency: string | null;
  readonly label: string;
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
  /** EndToEndId SEPA (sans `NOTPROVIDED`). */
  readonly endToEndId: string | null;
  /** Référence de la banque (AcctSvcrRef, FITID, numéro d'écriture). */
  readonly bankReference: string | null;
  /** Références fortes complémentaires (MsgId / PmtInfId d'un lot, référence RF, référence client). */
  readonly references: readonly string[];
  /** Code opération (BTC ISO `Domn/Fmly/SubFmly`, code CFONB, code SWIFT `N…`, type OFX). */
  readonly bankCode: string | null;
  /** Code motif de retour / rejet (R-transaction SEPA, motif CFONB). */
  readonly returnReason: string | null;
  /** Ligne provisoire (CAMT.052 / .054, MT942, statut PDNG) : fusionnée plus tard dans la définitive. */
  readonly provisional: boolean;
}

export interface ParsedStatement {
  readonly format: StatementFormat;
  readonly kind: StatementKind;
  /** Identifiant du relevé dans le fichier (Stmt/Id, :20:, numéro…). */
  readonly externalId: string | null;
  /** Numéro de séquence électronique / de relevé (contrôle de continuité). */
  readonly sequence: string | null;
  /** IBAN ou identifiant de compte porté par le fichier (contrôle du compte cible). */
  readonly accountIdentifier: string | null;
  readonly currency: string;
  readonly fromDate: string | null;
  readonly toDate: string | null;
  readonly openingBalanceMinor: number | null;
  readonly closingBalanceMinor: number | null;
  readonly transactions: readonly ParsedTransaction[];
}

export interface ParsedFile {
  readonly format: StatementFormat;
  readonly statements: readonly ParsedStatement[];
}

/** Options communes de lecture. */
export interface ParseOptions {
  /** Devise par défaut (fichiers qui ne la portent pas : QIF, certains CSV). */
  readonly defaultCurrency: string;
  readonly maxLines: number;
  readonly qifDateOrder?: "DMY" | "MDY" | "YMD";
}

export const transaction = (input: Partial<ParsedTransaction> & Pick<ParsedTransaction, "bookingDate" | "amountMinor" | "currency">): ParsedTransaction => ({
  valueDate: null,
  originalAmountMinor: null,
  originalCurrency: null,
  label: "",
  counterpartyName: null,
  counterpartyIban: null,
  endToEndId: null,
  bankReference: null,
  references: [],
  bankCode: null,
  returnReason: null,
  provisional: false,
  ...input,
});
