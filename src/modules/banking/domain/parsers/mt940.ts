/**
 * Lecteur SWIFT MT940 (relevé de fin de journée) et MT942 (intrajournalier, provisoire).
 * Champs : :20: référence, :25: compte, :28C: numéro de relevé, :60F/M: solde d'ouverture,
 * :61: mouvement, :86: informations (sous-champs `?20…?33` des banques allemandes, mots-clés
 * `/EREF/…/REMI/…` des variantes françaises et néerlandaises, sinon texte libre), :62F/M: solde
 * de clôture. Plusieurs relevés par fichier, en-têtes de blocs `{1:…}{4:` tolérés.
 */
import { Effect } from "effect";
import { StatementParseError } from "../errors";
import { transaction, type ParsedFile, type ParsedStatement, type ParsedTransaction, type ParseOptions } from "./types";
import { canonicalAmount, cleanText, decimalToMinor, endToEndOrNull, exponentOf, fullYear, ibanOrNull, isoDate, nullableText, yymmdd } from "./values";

interface Field { readonly tag: string; readonly value: string }

/** Découpe en champs `:TAG:valeur` (les lignes de continuation sont rattachées au champ courant). */
export const mtFields = (text: string): Field[] => {
  const body = text.replace(/\r\n?/g, "\n").replace(/\{[1-3]:[^}]*\}/g, "").replace(/\{4:\s*/g, "").replace(/^-\}?\s*$/gm, "").replace(/\{5:[^}]*\}/g, "");
  const fields: { tag: string; value: string }[] = [];
  for (const line of body.split("\n")) {
    const match = /^:(\d{2}[A-Z]?):(.*)$/.exec(line);
    if (match) fields.push({ tag: match[1]!, value: match[2]! });
    else if (fields.length > 0 && line.trim() !== "" && line.trim() !== "-") fields[fields.length - 1]!.value += `\n${line}`;
  }
  return fields;
};

const balanceOf = (value: string, format: "mt940" | "mt942") => {
  const match = /^([CD])(\d{6})([A-Z]{3})([\d,]+)/.exec(value.trim());
  if (!match) return null;
  const exponent = exponentOf(match[3]!);
  const canonical = canonicalAmount(match[4]!, ",");
  const minor = exponent === null || canonical === null ? null : decimalToMinor(canonical, exponent);
  const date = yymmdd(match[2]!);
  if (minor === null || !date) return { error: new StatementParseError({ format, reason: "amount", detail: value.slice(0, 40) }) };
  return { minor: match[1] === "D" ? -minor : minor, currency: match[3]!, date };
};

/** Sous-champs allemands `?NN` (structure 86 « GVC »). */
const germanSubfields = (info: string): Map<string, string> | null => {
  const compact = info.replace(/\n/g, "");
  if (!/^\d{3}\?/.test(compact) && !/^\?\d{2}/.test(compact)) return null;
  const out = new Map<string, string>();
  const re = /\?(\d{2})([^?]*)/g;
  for (let match = re.exec(compact); match; match = re.exec(compact)) out.set(match[1]!, (out.get(match[1]!) ?? "") + match[2]!);
  return out;
};

/** Mots-clés `/CODE/valeur` (ING, Rabobank, variantes FR). */
const slashKeywords = (info: string): Map<string, string> | null => {
  const compact = info.replace(/\n/g, "");
  if (!/^\/[A-Z]{2,4}\//.test(compact)) return null;
  const out = new Map<string, string>();
  const re = /\/([A-Z]{2,4})\/(.*?)(?=\/[A-Z]{2,4}\/|$)/g;
  for (let match = re.exec(compact); match; match = re.exec(compact)) out.set(match[1]!, match[2]!.trim());
  return out;
};

/** SEPA-Verwendungszweck (`EREF+`, `KREF+`, `MREF+`, `SVWZ+`). */
const sepaKeys = (text: string) => {
  const out = new Map<string, string>();
  const re = /(EREF|KREF|MREF|CRED|DEBT|SVWZ|ABWA|ABWE)\+(.*?)(?=(?:EREF|KREF|MREF|CRED|DEBT|SVWZ|ABWA|ABWE)\+|$)/g;
  for (let match = re.exec(text); match; match = re.exec(text)) out.set(match[1]!, match[2]!.trim());
  return out;
};

interface Info { label: string; name: string | null; iban: string | null; endToEndId: string | null; references: string[]; returnReason: string | null }

export const parseInfo86 = (info: string): Info => {
  const german = germanSubfields(info);
  if (german) {
    const purpose = ["20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "60", "61", "62", "63"].map((key) => german.get(key) ?? "").join("");
    const keys = sepaKeys(purpose);
    const label = cleanText([german.get("00"), keys.get("SVWZ") ?? purpose.replace(/(EREF|KREF|MREF|CRED|DEBT)\+\S+/g, "")].filter(Boolean).join(" "));
    const references = [keys.get("EREF"), keys.get("KREF"), keys.get("MREF")].filter((v): v is string => !!v && v.toUpperCase() !== "NOTPROVIDED");
    return {
      label, name: nullableText(`${german.get("32") ?? ""}${german.get("33") ?? ""}`, 140), iban: ibanOrNull(german.get("31")),
      endToEndId: endToEndOrNull(keys.get("EREF")), references, returnReason: null,
    };
  }
  const keywords = slashKeywords(info);
  if (keywords) {
    const name = nullableText(keywords.get("NAME") ?? keywords.get("BENM")?.replace(/^\/\/?/, "").replace(/^NAME\//, "") ?? keywords.get("ORDP")?.replace(/^\/\/?/, "").replace(/^NAME\//, ""), 140);
    const eref = endToEndOrNull(keywords.get("EREF"));
    return {
      label: cleanText(keywords.get("REMI")?.replace(/^(USTD|STRD)\/\/?/, "") ?? info),
      name, iban: ibanOrNull(keywords.get("IBAN") ?? keywords.get("CNTP")?.split("/")[0]),
      endToEndId: eref, references: [eref, keywords.get("PREF"), keywords.get("MARF"), keywords.get("CSID")].filter((v): v is string => !!v),
      returnReason: nullableText(keywords.get("RTRN"), 8),
    };
  }
  const keys = sepaKeys(info.replace(/\n/g, ""));
  const eref = endToEndOrNull(keys.get("EREF"));
  return { label: cleanText(info), name: null, iban: null, endToEndId: eref, references: eref ? [eref] : [], returnReason: null };
};

/**
 * Champ :61: — `AAMMJJ[MMJJ](C|D|RC|RD)[code fonds]montant(N|F|S)XXX réf client[//réf banque][\n complément]`.
 */
export const parseLine61 = (value: string, currency: string, format: "mt940" | "mt942") => {
  const [first = "", ...rest] = value.split("\n");
  const match = /^(\d{6})(\d{4})?(RC|RD|C|D|EC|ED)([A-Z])?([\d,]+)([NFS][A-Z0-9]{3})([^/]*)(?:\/\/(.*))?$/.exec(first.trim());
  if (!match) return new StatementParseError({ format, reason: "structure", detail: `:61: illisible (${first.slice(0, 40)})` });
  const valueDate = yymmdd(match[1]!);
  if (!valueDate) return new StatementParseError({ format, reason: "date", detail: match[1]! });
  let bookingDate = valueDate;
  if (match[2]) {
    const year = Number(valueDate.slice(0, 4));
    const month = Number(match[2].slice(0, 2));
    const day = Number(match[2].slice(2, 4));
    // Date comptable MMJJ : même année, sauf passage d'année (décembre ↔ janvier).
    const valueMonth = Number(valueDate.slice(5, 7));
    const bookingYear = month === 1 && valueMonth === 12 ? year + 1 : month === 12 && valueMonth === 1 ? year - 1 : year;
    bookingDate = isoDate(bookingYear, month, day) ?? valueDate;
  }
  const exponent = exponentOf(currency);
  const canonical = canonicalAmount(match[5]!, ",");
  const minor = exponent === null || canonical === null ? null : decimalToMinor(canonical, exponent);
  if (minor === null) return new StatementParseError({ format, reason: "amount", detail: match[5]! });
  const mark = match[3]!;
  const credit = mark === "C" || mark === "RD" || mark === "EC";
  return {
    bookingDate, valueDate, amountMinor: credit ? minor : -minor,
    bankCode: match[6]!, customerReference: nullableText(match[7], 16), bankReference: nullableText(match[8], 16), supplementary: cleanText(rest.join(" "), 34),
    reversal: mark === "RC" || mark === "RD",
  };
};

export const parseMt940 = (text: string, options: ParseOptions): Effect.Effect<ParsedFile, StatementParseError> =>
  Effect.gen(function* () {
    const fields = mtFields(text);
    const format: "mt940" | "mt942" = fields.some((field) => field.tag === "34F" || field.tag === "13D") && !fields.some((field) => field.tag.startsWith("60")) ? "mt942" : "mt940";
    if (!fields.some((field) => field.tag === "20")) return yield* new StatementParseError({ format, reason: "format", detail: "champ :20: absent" });
    const statements: ParsedStatement[] = [];
    let current: { externalId: string | null; account: string | null; sequence: string | null; currency: string; opening: { minor: number; date: string } | null; closing: { minor: number; date: string } | null; transactions: ParsedTransaction[]; pending: ReturnType<typeof parseLine61> | null; fromDate: string | null } | null = null;
    let lines = 0;
    const flushPending = (info: string | null) => {
      if (!current?.pending || current.pending instanceof StatementParseError) return;
      const p = current.pending;
      const parsed = info ? parseInfo86(info) : null;
      const references = new Set<string>([...(parsed?.references ?? [])]);
      if (p.customerReference && p.customerReference.toUpperCase() !== "NONREF") references.add(p.customerReference);
      current.transactions.push(transaction({
        bookingDate: p.bookingDate, valueDate: p.valueDate, amountMinor: p.amountMinor, currency: current.currency,
        label: cleanText([parsed?.label, p.supplementary].filter(Boolean).join(" ")) || p.customerReference || "",
        counterpartyName: parsed?.name ?? null, counterpartyIban: parsed?.iban ?? null,
        endToEndId: parsed?.endToEndId ?? null, bankReference: p.bankReference, references: [...references],
        bankCode: p.bankCode, returnReason: parsed?.returnReason ?? (p.reversal ? "REVERSAL" : null), provisional: format === "mt942",
      }));
      current.pending = null;
    };
    const close = () => {
      if (!current) return;
      flushPending(null);
      const txs = current.transactions;
      statements.push({
        format, kind: format === "mt942" ? "intraday" : "statement", externalId: current.externalId, sequence: current.sequence,
        accountIdentifier: current.account, currency: current.currency,
        fromDate: current.opening?.date ?? current.fromDate ?? txs[0]?.bookingDate ?? null,
        toDate: current.closing?.date ?? txs.at(-1)?.bookingDate ?? null,
        openingBalanceMinor: format === "mt940" ? current.opening?.minor ?? null : null,
        closingBalanceMinor: format === "mt940" ? current.closing?.minor ?? null : null,
        transactions: txs,
      });
      current = null;
    };
    for (const field of fields) {
      switch (field.tag) {
        case "20":
          close();
          current = { externalId: nullableText(field.value, 35), account: null, sequence: null, currency: options.defaultCurrency, opening: null, closing: null, transactions: [], pending: null, fromDate: null };
          break;
        case "25": if (current) { const raw = field.value.trim(); current.account = ibanOrNull(raw.replace(/^[A-Z]{6}[A-Z0-9]{2,5}\//, "")) ?? nullableText(raw, 35); } break;
        case "28C": case "28": if (current) current.sequence = nullableText(field.value, 16); break;
        case "13D": if (current) { const match = /^(\d{2})(\d{2})(\d{2})/.exec(field.value); if (match) current.fromDate = isoDate(fullYear(Number(match[1])), Number(match[2]), Number(match[3])); } break;
        case "34F": if (current) { const match = /^([A-Z]{3})/.exec(field.value.trim()); if (match && exponentOf(match[1]!) !== null) current.currency = match[1]!; } break;
        case "60F": case "60M": case "62F": case "62M": {
          if (!current) break;
          const parsed = balanceOf(field.value, format);
          if (!parsed) return yield* new StatementParseError({ format, reason: "structure", detail: `:${field.tag}: illisible` });
          if ("error" in parsed) return yield* parsed.error!;
          current.currency = parsed.currency;
          if (field.tag.startsWith("60")) current.opening = { minor: parsed.minor, date: parsed.date };
          else { flushPending(null); current.closing = { minor: parsed.minor, date: parsed.date }; }
          break;
        }
        case "61": {
          if (!current) break;
          flushPending(null);
          if (++lines > options.maxLines) return yield* new StatementParseError({ format, reason: "too_many_lines", detail: `> ${options.maxLines}` });
          const parsed = parseLine61(field.value, current.currency, format);
          if (parsed instanceof StatementParseError) return yield* parsed;
          current.pending = parsed;
          break;
        }
        case "86": if (current) flushPending(field.value); break;
        default: break;
      }
    }
    close();
    if (statements.length === 0) return yield* new StatementParseError({ format, reason: "empty", detail: "aucun relevé" });
    return { format, statements };
  });
