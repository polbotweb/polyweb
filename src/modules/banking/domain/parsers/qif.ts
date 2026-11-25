/**
 * Lecteur QIF (Quicken Interchange Format, encore exporté par plusieurs banques françaises) :
 * `!Type:Bank|CCard|Cash|Oth A|Oth L`, enregistrements terminés par `^`, champs D (date), T/U
 * (montant), P (tiers), M (mémo), N (numéro), L (catégorie). L'ordre des dates est réglable
 * (jour/mois par défaut) car le format ne le précise pas ; une date incohérente est refusée.
 */
import { Effect } from "effect";
import { StatementParseError } from "../errors";
import { transaction, type ParsedFile, type ParsedTransaction, type ParseOptions } from "./types";
import { canonicalAmount, cleanText, decimalToMinor, exponentOf, fullYear, isoDate, nullableText } from "./values";

/** Date QIF (`31/12/2024`, `12/31'24`, `2024-12-31`, `31.12.24`) selon l'ordre demandé. */
export const qifDate = (raw: string, order: "DMY" | "MDY" | "YMD"): string | null => {
  const parts = raw.trim().replace(/'/g, "/").split(/[/.\-\s]+/).filter(Boolean).map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !/^\d{1,4}$/.test(p))) return null;
  const nums = parts.map(Number) as [number, number, number];
  if (parts[0]!.length === 4) return isoDate(nums[0], nums[1], nums[2]);
  const year = parts[2]!.length <= 2 ? fullYear(nums[2]) : nums[2];
  if (order === "MDY") return isoDate(year, nums[0], nums[1]);
  if (order === "YMD") return isoDate(parts[0]!.length <= 2 ? fullYear(nums[0]) : nums[0], nums[1], nums[2]);
  return isoDate(year, nums[1], nums[0]);
};

export const parseQif = (input: string, options: ParseOptions): Effect.Effect<ParsedFile, StatementParseError> =>
  Effect.gen(function* () {
    const lines = input.replace(/\r\n?/g, "\n").split("\n");
    const header = lines.find((line) => line.startsWith("!Type:"));
    if (!header) return yield* new StatementParseError({ format: "qif", reason: "format", detail: "en-tête !Type: absent" });
    if (/^!Type:(Invst|Memorized|Cat|Class|Prices)/i.test(header)) return yield* new StatementParseError({ format: "qif", reason: "format", detail: `type non bancaire : ${header}` });
    const currency = options.defaultCurrency.toUpperCase();
    const exponent = exponentOf(currency);
    if (exponent === null) return yield* new StatementParseError({ format: "qif", reason: "currency", detail: currency });
    const transactions: ParsedTransaction[] = [];
    let record: Record<string, string> = {};
    const order = options.qifDateOrder ?? "DMY";
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line || line.startsWith("!")) continue;
      if (line === "^") {
        if (Object.keys(record).length === 0) continue;
        if (transactions.length >= options.maxLines) return yield* new StatementParseError({ format: "qif", reason: "too_many_lines", detail: `> ${options.maxLines}` });
        const date = qifDate(record.D ?? "", order);
        if (!date) return yield* new StatementParseError({ format: "qif", reason: "date", detail: record.D ?? "date absente" });
        const amountRaw = (record.T ?? record.U ?? "").trim();
        const decimal = /,\d{1,2}$/.test(amountRaw) ? "," : ".";
        const canonical = canonicalAmount(amountRaw, decimal);
        const minor = canonical === null ? null : decimalToMinor(canonical, exponent);
        if (minor === null) return yield* new StatementParseError({ format: "qif", reason: "amount", detail: amountRaw || "montant absent" });
        const payee = nullableText(record.P, 140);
        transactions.push(transaction({
          bookingDate: date, amountMinor: minor, currency,
          label: cleanText([payee, record.M].filter(Boolean).join(" ")) || cleanText(record.L) || "QIF",
          counterpartyName: payee, references: record.N ? [cleanText(record.N, 35)] : [], bankCode: nullableText(record.L, 35),
        }));
        record = {};
        continue;
      }
      const key = line[0]!;
      record[key] = record[key] ? `${record[key]} ${line.slice(1)}` : line.slice(1);
    }
    if (transactions.length === 0) return yield* new StatementParseError({ format: "qif", reason: "empty", detail: "aucune opération" });
    const sorted = [...transactions].sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
    return {
      format: "qif",
      statements: [{ format: "qif", kind: "statement", externalId: null, sequence: null, accountIdentifier: null, currency, fromDate: sorted[0]!.bookingDate, toDate: sorted.at(-1)!.bookingDate, openingBalanceMinor: null, closingBalanceMinor: null, transactions }],
    };
  });
