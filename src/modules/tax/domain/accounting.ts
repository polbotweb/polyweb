/**
 * Écritures comptables et exports (purs) : construction d'écritures de vente équilibrées
 * (411 client / 706 produits / 44571 TVA collectée), export FEC (art. A47 A-1 du LPF)
 * et export CSV générique. Montants en unités mineures (core/money), sans flottants.
 */
import { Data, Effect } from "effect";
import { toDecimalString, zero, type CurrencyCode, type Money, type TaxTotals } from "@/core/money";

export interface JournalLine {
  readonly account: string;
  readonly accountLabel: string;
  /** Compte auxiliaire (client / fournisseur), optionnel. */
  readonly auxAccount?: string;
  readonly auxLabel?: string;
  readonly label: string;
  readonly debit: Money;
  readonly credit: Money;
}

export interface JournalEntry {
  readonly journalCode: string;
  readonly journalLabel: string;
  readonly entryNumber: string;
  /** Date ISO AAAA-MM-JJ. */
  readonly entryDate: string;
  readonly pieceRef: string;
  readonly pieceDate: string;
  readonly validationDate?: string;
  readonly lines: readonly JournalLine[];
}

export class UnbalancedEntryError extends Data.TaggedError("UnbalancedEntryError")<{ readonly entryNumber: string; readonly debit: number; readonly credit: number }> {
  override get message() {
    return `Écriture ${this.entryNumber} déséquilibrée : débit ${this.debit} ≠ crédit ${this.credit}`;
  }
}

export class AccountingExportError extends Data.TaggedError("AccountingExportError")<{ readonly reason: "siren" | "date" | "currency"; readonly value: string }> {
  override get message() {
    return `Export comptable invalide (${this.reason}) : ${this.value}`;
  }
}

/** Vérifie qu'une écriture est équilibrée et mono-devise. */
export const assertBalanced = (entry: JournalEntry): Effect.Effect<JournalEntry, UnbalancedEntryError | AccountingExportError> => {
  const currencies = new Set(entry.lines.flatMap((line) => [line.debit.currency, line.credit.currency]));
  if (currencies.size > 1) return Effect.fail(new AccountingExportError({ reason: "currency", value: [...currencies].join(",") }));
  const debit = entry.lines.reduce((acc, line) => acc + line.debit.amountMinor, 0);
  const credit = entry.lines.reduce((acc, line) => acc + line.credit.amountMinor, 0);
  return debit === credit && entry.lines.length >= 2 ? Effect.succeed(entry) : Effect.fail(new UnbalancedEntryError({ entryNumber: entry.entryNumber, debit, credit }));
};

export interface SaleEntryInput {
  readonly entryNumber: string;
  readonly date: string;
  readonly pieceRef: string;
  readonly customerAccount: string;
  readonly customerName: string;
  readonly totals: TaxTotals;
  /** Avoir : sens inversé. */
  readonly creditNote?: boolean;
  readonly journalCode?: string;
  readonly journalLabel?: string;
  readonly accounts?: { readonly receivable?: string; readonly revenue?: string; readonly vat?: string };
}

/** Écriture de vente : débit 411 (TTC) ; crédit 706 (HT par taux) et 44571 (TVA par taux). */
export const buildSaleEntry = (input: SaleEntryInput): Effect.Effect<JournalEntry, UnbalancedEntryError | AccountingExportError> => {
  const currency: CurrencyCode = input.totals.gross.currency;
  const none = zero(currency);
  const side = (amount: Money, debitSide: boolean) => (debitSide !== Boolean(input.creditNote) ? { debit: amount, credit: none } : { debit: none, credit: amount });
  const receivable = input.accounts?.receivable ?? "411000";
  const revenue = input.accounts?.revenue ?? "706000";
  const vat = input.accounts?.vat ?? "445710";
  const label = `${input.creditNote ? "Avoir" : "Facture"} ${input.pieceRef} ${input.customerName}`;
  const lines: JournalLine[] = [
    { account: receivable, accountLabel: "Clients", auxAccount: input.customerAccount, auxLabel: input.customerName, label, ...side(input.totals.gross, true) },
    ...input.totals.byRate.filter((row) => row.base.amountMinor !== 0).map((row) => ({ account: revenue, accountLabel: `Ventes ${row.ratePercent} %`, label, ...side(row.base, false) })),
    ...input.totals.byRate.filter((row) => row.tax.amountMinor !== 0).map((row) => ({ account: vat, accountLabel: `TVA collectée ${row.ratePercent} %`, label, ...side(row.tax, false) })),
  ];
  return assertBalanced({ journalCode: input.journalCode ?? "VE", journalLabel: input.journalLabel ?? "Ventes", entryNumber: input.entryNumber, entryDate: input.date, pieceRef: input.pieceRef, pieceDate: input.date, lines });
};

/** Colonnes FEC (ordre réglementaire). */
export const FEC_COLUMNS = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const fecDate = (iso: string) => Effect.fromNullishOr(ISO_DATE.exec(iso)).pipe(Effect.map((m) => `${m[1]}${m[2]}${m[3]}`), Effect.mapError(() => new AccountingExportError({ reason: "date", value: iso })));
const fecAmount = (value: Money) => toDecimalString(value).replace(".", ",");
const fecText = (value: string) => value.replace(/[\t\r\n|]/g, " ").trim();

/**
 * Fichier des écritures comptables (FEC) : 18 colonnes séparées par « | », dates AAAAMMJJ,
 * décimales à virgule, nom `<SIREN>FEC<AAAAMMJJ>.txt` (date de clôture). Devise de tenue : EUR
 * (Montantdevise / Idevise renseignés pour toute autre devise).
 */
export const toFec = (entries: readonly JournalEntry[], options: { readonly siren: string; readonly closingDate: string }) =>
  Effect.gen(function* () {
    if (!/^\d{9}$/.test(options.siren)) return yield* Effect.fail(new AccountingExportError({ reason: "siren", value: options.siren }));
    const closing = yield* fecDate(options.closingDate);
    const rows: string[] = [FEC_COLUMNS.join("|")];
    for (const entry of entries) {
      yield* assertBalanced(entry);
      const date = yield* fecDate(entry.entryDate);
      const pieceDate = yield* fecDate(entry.pieceDate);
      const validDate = entry.validationDate ? yield* fecDate(entry.validationDate) : date;
      for (const line of entry.lines) {
        const foreign = line.debit.currency !== "EUR";
        const amount = line.debit.amountMinor !== 0 ? line.debit : line.credit;
        rows.push([
          entry.journalCode, entry.journalLabel, entry.entryNumber, date, line.account, line.accountLabel, line.auxAccount ?? "", line.auxLabel ?? "",
          entry.pieceRef, pieceDate, line.label, fecAmount(line.debit), fecAmount(line.credit), "", "", validDate,
          foreign ? fecAmount(amount) : "", foreign ? line.debit.currency : "",
        ].map(fecText).join("|"));
      }
    }
    return { filename: `${options.siren}FEC${closing}.txt`, content: `${rows.join("\r\n")}\r\n` };
  });

const csvCell = (value: string) => (/[",;\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Export CSV générique (séparateur « ; » par défaut, montants à point décimal, une ligne par mouvement). */
export const toAccountingCsv = (entries: readonly JournalEntry[], options: { readonly separator?: string } = {}) =>
  Effect.gen(function* () {
    const separator = options.separator ?? ";";
    const header = ["journal", "entry", "date", "account", "account_label", "aux_account", "piece", "label", "debit", "credit", "currency"];
    const rows = [header.join(separator)];
    for (const entry of entries) {
      yield* assertBalanced(entry);
      for (const line of entry.lines) {
        rows.push([entry.journalCode, entry.entryNumber, entry.entryDate, line.account, line.accountLabel, line.auxAccount ?? "", entry.pieceRef, line.label, toDecimalString(line.debit), toDecimalString(line.credit), line.debit.currency].map(csvCell).join(separator));
      }
    }
    return `${rows.join("\r\n")}\r\n`;
  });
