/**
 * Lecteur CFONB 120 (relevé de compte français, enregistrements de 120 caractères) :
 * 01 ancien solde, 04 mouvement, 05 complément du mouvement précédent (qualifiants LIB, NPY, NBE,
 * IPY, IBE, RCN, REF…), 07 nouveau solde. Montants sur 14 positions dont la dernière porte le
 * signe (« overpunch » : `{`/`A`…`I` positifs, `}`/`J`…`R` négatifs), nombre de décimales en
 * position 20. Fichiers avec ou sans fins de ligne. Le compte est identifié par banque + guichet
 * + numéro (le RIB contenu dans l'IBAN français).
 */
import { Effect } from "effect";
import { StatementParseError } from "../errors";
import { transaction, type ParsedFile, type ParsedStatement, type ParsedTransaction, type ParseOptions } from "./types";
import { cleanText, ddmmyy, exponentOf, ibanOrNull, nullableText } from "./values";

const POSITIVE = "{ABCDEFGHI";
const NEGATIVE = "}JKLMNOPQR";

/** Montant CFONB signé (14 caractères, dernier = chiffre + signe) → unités de `decimals` décimales. */
export const cfonbAmount = (raw: string): { value: bigint } | null => {
  if (raw.length !== 14 || !/^\d{13}$/.test(raw.slice(0, 13))) return null;
  const last = raw[13]!;
  let digit = POSITIVE.indexOf(last);
  let sign = 1n;
  if (digit < 0) { digit = NEGATIVE.indexOf(last); sign = -1n; }
  if (digit < 0) return null;
  return { value: sign * BigInt(raw.slice(0, 13) + String(digit)) };
};

/** Découpe en enregistrements : lignes de 120, ou flux continu multiple de 120. */
export const cfonbRecords = (text: string): string[] | null => {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const lines = normalized.includes("\n") ? normalized.split("\n").map((line) => line.replace(/\s+$/, "").padEnd(120, " ")) : null;
  if (lines) return lines.every((line) => line.length === 120) ? lines : null;
  if (normalized.length % 120 !== 0) return null;
  const out: string[] = [];
  for (let index = 0; index < normalized.length; index += 120) out.push(normalized.slice(index, index + 120));
  return out;
};

export const looksLikeCfonb = (text: string): boolean => {
  const records = cfonbRecords(text.slice(0, 120 * 50));
  return !!records && records.length > 0 && records.every((record) => /^(01|04|05|07)\d{5}/.test(record));
};

/** Qualifiants usuels du complément 05. */
const QUALIFIERS = { label: ["LIB", "LCC", "LC2"], payer: ["NPY", "NPO"], payee: ["NBE", "NBU"], payerId: ["IPY"], payeeId: ["IBE"], reference: ["RCN", "REF", "NPR", "RDB"] } as const;

export const parseCfonb120 = (text: string, options: ParseOptions): Effect.Effect<ParsedFile, StatementParseError> =>
  Effect.gen(function* () {
    const records = cfonbRecords(text);
    if (!records) return yield* new StatementParseError({ format: "cfonb120", reason: "format", detail: "enregistrements de 120 caractères attendus" });
    const statements: ParsedStatement[] = [];
    let current: { account: string; currency: string; decimals: number; opening: { minor: number; date: string } | null; transactions: ParsedTransaction[]; extras: { label: string[]; name: string | null; refs: string[]; iban: string | null }[] } | null = null;
    let lines = 0;
    const amount = (record: string, decimals: number, currency: string) => {
      const raw = cfonbAmount(record.slice(90, 104));
      const exponent = exponentOf(currency);
      if (!raw || exponent === null) return null;
      // Ramène les `decimals` décimales du fichier à l'exposant de la devise (exact uniquement).
      if (decimals === exponent) return Number(raw.value);
      if (decimals < exponent) return Number(raw.value * 10n ** BigInt(exponent - decimals));
      const divisor = 10n ** BigInt(decimals - exponent);
      return raw.value % divisor === 0n ? Number(raw.value / divisor) : null;
    };
    const finish = (closing: { minor: number; date: string } | null) => {
      if (!current) return;
      const txs = current.transactions.map((tx, index) => {
        const extra = current!.extras[index]!;
        const label = cleanText([tx.label, ...extra.label].join(" "));
        return { ...tx, label, counterpartyName: extra.name, counterpartyIban: extra.iban, references: [...new Set([...tx.references, ...extra.refs])] };
      });
      statements.push({
        format: "cfonb120", kind: "statement", externalId: null, sequence: null, accountIdentifier: current.account, currency: current.currency,
        fromDate: current.opening?.date ?? txs[0]?.bookingDate ?? null, toDate: closing?.date ?? txs.at(-1)?.bookingDate ?? null,
        openingBalanceMinor: current.opening?.minor ?? null, closingBalanceMinor: closing?.minor ?? null, transactions: txs,
      });
      current = null;
    };
    for (const [position, record] of records.entries()) {
      const code = record.slice(0, 2);
      const currency = record.slice(16, 19).trim().toUpperCase() || options.defaultCurrency;
      const decimals = Number(record[19]);
      const account = `${record.slice(2, 7)}${record.slice(11, 16)}${record.slice(21, 32)}`.replace(/\s/g, "");
      const bad = (detail: string) => new StatementParseError({ format: "cfonb120", reason: "structure", detail: `enregistrement ${position + 1} : ${detail}` });
      if (code === "01") {
        finish(null);
        if (exponentOf(currency) === null) return yield* new StatementParseError({ format: "cfonb120", reason: "currency", detail: currency });
        const date = ddmmyy(record.slice(34, 40));
        const minor = Number.isInteger(decimals) ? amount(record, decimals, currency) : null;
        if (!date || minor === null) return yield* bad("ancien solde illisible");
        current = { account, currency, decimals, opening: { minor, date }, transactions: [], extras: [] };
      } else if (code === "04") {
        if (!current) current = { account, currency, decimals, opening: null, transactions: [], extras: [] };
        if (++lines > options.maxLines) return yield* new StatementParseError({ format: "cfonb120", reason: "too_many_lines", detail: `> ${options.maxLines}` });
        const bookingDate = ddmmyy(record.slice(34, 40));
        const valueDate = ddmmyy(record.slice(42, 48));
        const minor = Number.isInteger(decimals) ? amount(record, decimals, currency) : null;
        if (!bookingDate || minor === null) return yield* bad("mouvement illisible");
        const entryNumber = nullableText(record.slice(81, 88), 7);
        const reference = nullableText(record.slice(104, 120), 16);
        current.transactions.push(transaction({
          bookingDate, valueDate, amountMinor: minor, currency,
          label: cleanText(record.slice(48, 79)),
          bankReference: entryNumber ? `${bookingDate}-${entryNumber}` : null,
          references: reference ? [reference] : [],
          bankCode: nullableText(record.slice(32, 34), 2) ? `CFONB:${record.slice(32, 34)}${record.slice(7, 11).trim() ? `/${record.slice(7, 11).trim()}` : ""}` : null,
          returnReason: nullableText(record.slice(40, 42), 2),
        }));
        current.extras.push({ label: [], name: null, refs: [], iban: null });
      } else if (code === "05") {
        const extra = current?.extras.at(-1);
        if (!extra) return yield* bad("complément sans mouvement");
        const qualifier = record.slice(45, 48).toUpperCase();
        const info = cleanText(record.slice(48, 118));
        if (!info) continue;
        if ((QUALIFIERS.label as readonly string[]).includes(qualifier)) extra.label.push(info);
        else if ((QUALIFIERS.payer as readonly string[]).includes(qualifier) || (QUALIFIERS.payee as readonly string[]).includes(qualifier)) extra.name ??= info.slice(0, 140);
        else if ((QUALIFIERS.payerId as readonly string[]).includes(qualifier) || (QUALIFIERS.payeeId as readonly string[]).includes(qualifier)) extra.iban ??= ibanOrNull(info.split(" ")[0]);
        else if ((QUALIFIERS.reference as readonly string[]).includes(qualifier)) extra.refs.push(info.slice(0, 35));
        else extra.label.push(info);
      } else if (code === "07") {
        if (!current) return yield* bad("nouveau solde sans relevé");
        const date = ddmmyy(record.slice(34, 40));
        const minor = Number.isInteger(decimals) ? amount(record, decimals, current.currency) : null;
        if (!date || minor === null) return yield* bad("nouveau solde illisible");
        finish({ minor, date });
      } else if (record.trim() !== "") {
        return yield* bad(`code ${code} inconnu`);
      }
    }
    finish(null);
    if (statements.length === 0) return yield* new StatementParseError({ format: "cfonb120", reason: "empty", detail: "aucun relevé" });
    return { format: "cfonb120", statements };
  });
