/**
 * Lecteur CSV / TSV à correspondance de colonnes réglable (profil par compte) : séparateur,
 * décimale, format de date, encodage, montant signé ou colonnes débit / crédit, lignes d'en-tête à
 * ignorer, colonnes désignées par position (1, 2…) ou par nom d'en-tête. Analyse RFC 4180
 * (guillemets, guillemets doublés, retours à la ligne dans un champ) en un seul passage linéaire.
 * Préréglages des grandes banques françaises : points de départ modifiables, jamais imposés.
 */
import { Effect } from "effect";
import { CSV_AMOUNT_MODES, CSV_DATE_FORMATS, CSV_DELIMITERS, CSV_ENCODINGS, CSV_FIELDS, type CsvAmountMode, type CsvDateFormat, type CsvDelimiter, type CsvEncoding, type CsvField } from "../constants";
import { InvalidCsvProfileError, StatementParseError } from "../errors";
import { transaction, type ParsedFile, type ParsedTransaction, type ParseOptions } from "./types";
import { canonicalAmount, cleanText, decimalToMinor, exponentOf, fullYear, ibanOrNull, isoDate, nullableText } from "./values";

export interface CsvProfile {
  readonly delimiter: CsvDelimiter;
  readonly decimal: "," | ".";
  readonly dateFormat: CsvDateFormat;
  readonly encoding: CsvEncoding;
  readonly amountMode: CsvAmountMode;
  /** Colonne débit en valeurs positives (le cas courant) : elles sont rendues négatives. */
  readonly debitPositive: boolean;
  /** Inverse le signe du montant (exports « point de vue carte »). */
  readonly invertSign: boolean;
  /** Lignes à ignorer avant l'en-tête (ou avant les données si pas d'en-tête). */
  readonly skipLines: number;
  readonly hasHeader: boolean;
  /** Colonne de chaque champ : position 1-based (`"3"`) ou nom d'en-tête (insensible à la casse). */
  readonly columns: Readonly<Partial<Record<CsvField, string>>>;
  /** Devise si aucune colonne ne la porte. */
  readonly currency: string | null;
}

export const DEFAULT_CSV_PROFILE: CsvProfile = {
  delimiter: ";", decimal: ",", dateFormat: "DD/MM/YYYY", encoding: "utf-8", amountMode: "signed", debitPositive: true, invertSign: false,
  skipLines: 0, hasHeader: true, columns: { bookingDate: "1", label: "2", amount: "3" }, currency: null,
};

/** Préréglages (banques françaises et néobanques). Les exports évoluent : tout reste modifiable. */
export const CSV_PRESETS: Readonly<Record<string, { readonly label: string; readonly profile: CsvProfile }>> = {
  bnp: { label: "BNP Paribas", profile: { ...DEFAULT_CSV_PROFILE, encoding: "windows-1252", skipLines: 1, hasHeader: false, columns: { bookingDate: "1", bankCode: "2", label: "4", amount: "5" } } },
  societe_generale: { label: "Société Générale", profile: { ...DEFAULT_CSV_PROFILE, encoding: "windows-1252", skipLines: 2, columns: { bookingDate: "Date de l'opération", label: "Libellé", amount: "Montant de l'opération", currency: "Devise" } } },
  credit_agricole: { label: "Crédit Agricole", profile: { ...DEFAULT_CSV_PROFILE, encoding: "windows-1252", amountMode: "debit_credit", skipLines: 0, columns: { bookingDate: "Date", label: "Libellé", debit: "Débit euros", credit: "Crédit euros" } } },
  lcl: { label: "LCL", profile: { ...DEFAULT_CSV_PROFILE, encoding: "windows-1252", hasHeader: false, columns: { bookingDate: "1", amount: "2", bankCode: "3", label: "5" } } },
  bpce: { label: "Banque Populaire / Caisse d'Épargne", profile: { ...DEFAULT_CSV_PROFILE, amountMode: "debit_credit", columns: { bookingDate: "Date operation", valueDate: "Date de valeur", label: "Libelle", reference: "Reference", debit: "Debit", credit: "Credit" } } },
  credit_mutuel: { label: "Crédit Mutuel / CIC", profile: { ...DEFAULT_CSV_PROFILE, amountMode: "debit_credit", columns: { bookingDate: "Date", valueDate: "Date de valeur", debit: "Débit", credit: "Crédit", label: "Libellé", balance: "Solde" } } },
  banque_postale: { label: "La Banque Postale", profile: { ...DEFAULT_CSV_PROFILE, encoding: "windows-1252", skipLines: 6, columns: { bookingDate: "Date", label: "Libellé", amount: "Montant(EUROS)" } } },
  boursobank: { label: "BoursoBank", profile: { ...DEFAULT_CSV_PROFILE, columns: { bookingDate: "dateOp", valueDate: "dateVal", label: "label", bankCode: "category", amount: "amount", balance: "accountbalance" } } },
  qonto: { label: "Qonto", profile: { ...DEFAULT_CSV_PROFILE, delimiter: ";", decimal: ",", dateFormat: "DD-MM-YYYY", columns: { bookingDate: "Date de l'opération (UTC)", valueDate: "Date de la valeur (UTC)", counterpartyName: "Contrepartie", label: "Référence", amount: "Montant total (TTC)", currency: "Devise", counterpartyIban: "IBAN de la contrepartie" } } },
  shine: { label: "Shine", profile: { ...DEFAULT_CSV_PROFILE, amountMode: "debit_credit", columns: { bookingDate: "Date de la transaction", label: "Libellé", counterpartyName: "Nom de la contrepartie", debit: "Débit", credit: "Crédit" } } },
  generic_iso: { label: "Générique (AAAA-MM-JJ, point décimal, virgule)", profile: { ...DEFAULT_CSV_PROFILE, delimiter: ",", decimal: ".", dateFormat: "YYYY-MM-DD", columns: { bookingDate: "1", label: "2", amount: "3" } } },
};

const COLUMN = /^.{1,80}$/;

export const validateCsvProfile = (input: CsvProfile): Effect.Effect<CsvProfile, InvalidCsvProfileError> =>
  Effect.gen(function* () {
    if (!(CSV_DELIMITERS as readonly string[]).includes(input.delimiter)) return yield* new InvalidCsvProfileError({ field: "delimiter", value: input.delimiter });
    if (input.decimal !== "," && input.decimal !== ".") return yield* new InvalidCsvProfileError({ field: "decimal", value: String(input.decimal) });
    if (input.decimal === input.delimiter) return yield* new InvalidCsvProfileError({ field: "decimal", value: "= séparateur" });
    if (!(CSV_DATE_FORMATS as readonly string[]).includes(input.dateFormat)) return yield* new InvalidCsvProfileError({ field: "dateFormat", value: input.dateFormat });
    if (!(CSV_ENCODINGS as readonly string[]).includes(input.encoding)) return yield* new InvalidCsvProfileError({ field: "encoding", value: input.encoding });
    if (!(CSV_AMOUNT_MODES as readonly string[]).includes(input.amountMode)) return yield* new InvalidCsvProfileError({ field: "amountMode", value: input.amountMode });
    if (!Number.isInteger(input.skipLines) || input.skipLines < 0 || input.skipLines > 50) return yield* new InvalidCsvProfileError({ field: "skipLines", value: String(input.skipLines) });
    const columns: Partial<Record<CsvField, string>> = {};
    for (const [field, raw] of Object.entries(input.columns)) {
      if (!(CSV_FIELDS as readonly string[]).includes(field)) return yield* new InvalidCsvProfileError({ field: "columns", value: field });
      const value = (raw ?? "").trim();
      if (!value) continue;
      if (!COLUMN.test(value)) return yield* new InvalidCsvProfileError({ field: field, value });
      if (!input.hasHeader && !/^\d{1,3}$/.test(value)) return yield* new InvalidCsvProfileError({ field: field, value: "position attendue sans en-tête" });
      columns[field as CsvField] = value;
    }
    if (!columns.bookingDate) return yield* new InvalidCsvProfileError({ field: "bookingDate", value: "colonne requise" });
    if (input.amountMode === "signed" && !columns.amount) return yield* new InvalidCsvProfileError({ field: "amount", value: "colonne requise" });
    if (input.amountMode === "debit_credit" && (!columns.debit || !columns.credit)) return yield* new InvalidCsvProfileError({ field: "debit", value: "colonnes débit et crédit requises" });
    if (input.currency && exponentOf(input.currency) === null) return yield* new InvalidCsvProfileError({ field: "currency", value: input.currency });
    return { ...input, columns, currency: input.currency ? input.currency.toUpperCase() : null };
  });

/** Analyse RFC 4180 (une passe). Renvoie les lignes de champs ; `null` si un guillemet n'est jamais fermé. */
export const csvRows = (input: string, delimiter: string, maxRows: number): string[][] | null => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;
  const text = input.replace(/^\uFEFF/, "");
  while (index < text.length) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 2; continue; }
        quoted = false; index += 1; continue;
      }
      field += char; index += 1; continue;
    }
    if (char === '"' && field === "") { quoted = true; index += 1; continue; }
    if (char === delimiter) { row.push(field); field = ""; index += 1; continue; }
    if (char === "\r" || char === "\n") {
      row.push(field); field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      if (rows.length > maxRows) return rows;
      row = [];
      index += char === "\r" && text[index + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += char; index += 1;
  }
  if (quoted) return null;
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
};

/** Date selon le format du profil. */
export const csvDate = (raw: string, format: CsvDateFormat): string | null => {
  const value = raw.trim().slice(0, 10);
  const n = (from: number, to: number) => Number(value.slice(from, to));
  switch (format) {
    case "YYYY-MM-DD": return /^\d{4}-\d{2}-\d{2}$/.test(value) ? isoDate(n(0, 4), n(5, 7), n(8, 10)) : null;
    case "YYYYMMDD": return /^\d{8}$/.test(value) ? isoDate(n(0, 4), n(4, 6), n(6, 8)) : null;
    default: {
      const parts = value.split(/[/.-]/);
      if (parts.length !== 3 || parts.some((p) => !/^\d{1,4}$/.test(p))) return null;
      const [a, b, c] = parts.map(Number) as [number, number, number];
      const year = parts[2]!.length <= 2 ? fullYear(c) : c;
      return format === "MM/DD/YYYY" ? isoDate(year, a, b) : isoDate(year, b, a);
    }
  }
};

/** Index (0-based) de chaque champ mappé, d'après la position ou l'en-tête. */
export const resolveColumns = (profile: CsvProfile, header: readonly string[] | null): Partial<Record<CsvField, number>> | string => {
  const normalized = (header ?? []).map((value) => value.trim().toLowerCase());
  const out: Partial<Record<CsvField, number>> = {};
  for (const [field, ref] of Object.entries(profile.columns) as [CsvField, string][]) {
    if (/^\d{1,3}$/.test(ref)) { out[field] = Number(ref) - 1; continue; }
    const index = normalized.indexOf(ref.trim().toLowerCase());
    if (index < 0) return ref;
    out[field] = index;
  }
  return out;
};

export interface CsvPreview { readonly header: readonly string[] | null; readonly rows: readonly (readonly string[])[] }

/** Aperçu brut (en-tête + premières lignes) pour l'écran de correspondance des colonnes. */
export const previewCsv = (text: string, profile: Pick<CsvProfile, "delimiter" | "skipLines" | "hasHeader">, limit = 10): CsvPreview | null => {
  const rows = csvRows(text, profile.delimiter, profile.skipLines + limit + 1);
  if (!rows) return null;
  const body = rows.slice(profile.skipLines);
  return profile.hasHeader ? { header: body[0] ?? [], rows: body.slice(1, limit + 1) } : { header: null, rows: body.slice(0, limit) };
};

export const parseCsv = (text: string, profile: CsvProfile, options: ParseOptions): Effect.Effect<ParsedFile, StatementParseError> =>
  Effect.gen(function* () {
    const rows = csvRows(text, profile.delimiter, profile.skipLines + options.maxLines + 1);
    if (!rows) return yield* new StatementParseError({ format: "csv", reason: "structure", detail: "guillemet non fermé" });
    const body = rows.slice(profile.skipLines);
    const header = profile.hasHeader ? body[0] ?? null : null;
    const data = profile.hasHeader ? body.slice(1) : body;
    if (data.length > options.maxLines) return yield* new StatementParseError({ format: "csv", reason: "too_many_lines", detail: `> ${options.maxLines}` });
    const columns = resolveColumns(profile, header);
    if (typeof columns === "string") return yield* new StatementParseError({ format: "csv", reason: "structure", detail: `colonne introuvable : ${columns}` });
    const cell = (row: readonly string[], field: CsvField) => (columns[field] === undefined ? "" : (row[columns[field]!] ?? "").trim());
    const defaultCurrency = (profile.currency ?? options.defaultCurrency).toUpperCase();
    const transactions: ParsedTransaction[] = [];
    let closing: { minor: number; date: string } | null = null;
    for (const [position, row] of data.entries()) {
      const line = position + 1 + profile.skipLines + (profile.hasHeader ? 1 : 0);
      const bookingDate = csvDate(cell(row, "bookingDate"), profile.dateFormat);
      if (!bookingDate) return yield* new StatementParseError({ format: "csv", reason: "date", detail: `ligne ${line} : « ${cell(row, "bookingDate").slice(0, 20)} »` });
      const currency = (cell(row, "currency") || defaultCurrency).toUpperCase();
      const exponent = exponentOf(currency);
      if (exponent === null) return yield* new StatementParseError({ format: "csv", reason: "currency", detail: `ligne ${line} : ${currency}` });
      const toMinor = (raw: string) => { const canonical = canonicalAmount(raw, profile.decimal); return canonical === null ? null : decimalToMinor(canonical, exponent); };
      let minor: number | null;
      if (profile.amountMode === "signed") {
        minor = toMinor(cell(row, "amount"));
      } else {
        const debitRaw = cell(row, "debit");
        const creditRaw = cell(row, "credit");
        const debit = debitRaw ? toMinor(debitRaw) : 0;
        const credit = creditRaw ? toMinor(creditRaw) : 0;
        minor = debit === null || credit === null ? null : Math.abs(credit) - (profile.debitPositive ? Math.abs(debit) : -debit);
      }
      if (minor === null) return yield* new StatementParseError({ format: "csv", reason: "amount", detail: `ligne ${line}` });
      if (profile.invertSign) minor = -minor;
      const valueDate = cell(row, "valueDate") ? csvDate(cell(row, "valueDate"), profile.dateFormat) : null;
      const reference = nullableText(cell(row, "reference"), 35);
      const name = nullableText(cell(row, "counterpartyName"), 140);
      transactions.push(transaction({
        bookingDate, valueDate, amountMinor: minor, currency,
        label: cleanText([cell(row, "label"), name && !cell(row, "label").includes(name) ? name : ""].filter(Boolean).join(" ")) || reference || "",
        counterpartyName: name, counterpartyIban: ibanOrNull(cell(row, "counterpartyIban")), references: reference ? [reference] : [],
        bankCode: nullableText(cell(row, "bankCode"), 35),
      }));
      const balanceRaw = cell(row, "balance");
      if (balanceRaw) {
        const balance = toMinor(balanceRaw);
        if (balance !== null && (!closing || bookingDate >= closing.date)) closing = { minor: balance, date: bookingDate };
      }
    }
    if (transactions.length === 0) return yield* new StatementParseError({ format: "csv", reason: "empty", detail: "aucune ligne" });
    const sorted = [...transactions].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
    const currency = transactions[0]!.currency;
    return {
      format: "csv",
      statements: [{
        format: "csv", kind: "statement", externalId: null, sequence: null, accountIdentifier: null, currency,
        fromDate: sorted[0]!.bookingDate, toDate: sorted.at(-1)!.bookingDate,
        // Le solde de la colonne « solde » (dernière date) sert de solde de clôture ; l'ouverture s'en déduit.
        openingBalanceMinor: closing && closing.date === sorted.at(-1)!.bookingDate ? closing.minor - transactions.reduce((sum, tx) => sum + tx.amountMinor, 0) : null,
        closingBalanceMinor: closing && closing.date === sorted.at(-1)!.bookingDate ? closing.minor : null,
        transactions,
      }],
    };
  });
