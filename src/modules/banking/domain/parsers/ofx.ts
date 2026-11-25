/**
 * Lecteur OFX 1.x (SGML, balises non fermées), OFX 2.x (XML) et QFX. Un balayage linéaire unique
 * construit l'arbre : une balise suivie de texte et non refermée est une feuille (SGML), un
 * agrégat se referme par `</TAG>`. Aucune DTD n'est lue (l'en-tête SGML est ignoré, `<!DOCTYPE`
 * refusé en OFX 2). Comptes courants (`STMTRS`) et cartes (`CCSTMTRS`).
 */
import { Effect } from "effect";
import { decodeXmlEntities } from "@/core/xml";
import { StatementParseError } from "../errors";
import { transaction, type ParsedFile, type ParsedStatement, type ParsedTransaction, type ParseOptions } from "./types";
import { canonicalAmount, cleanText, decimalToMinor, exponentOf, isoDate, nullableText } from "./values";

interface Node { readonly tag: string; readonly children: Node[]; text: string }

const MAX_DEPTH = 32;

/** Arbre OFX tolérant (SGML ou XML). `null` si la structure est incohérente. */
export const ofxTree = (input: string): Node | null => {
  const start = input.search(/<OFX>/i);
  if (start < 0) return null;
  const body = input.slice(start);
  const root: Node = { tag: "#ROOT", children: [], text: "" };
  const stack: Node[] = [root];
  const re = /<(\/?)([A-Za-z0-9_.]+)(?:\s[^>]*)?>([^<]*)/g;
  for (let match = re.exec(body); match; match = re.exec(body)) {
    const closing = match[1] === "/";
    const tag = match[2]!.toUpperCase();
    const text = (decodeXmlEntities(match[3]!) ?? match[3]!).trim();
    if (closing) {
      const index = stack.map((node) => node.tag).lastIndexOf(tag);
      if (index <= 0) continue;
      stack.length = index;
      continue;
    }
    const parent = stack.at(-1)!;
    const node: Node = { tag, children: [], text };
    parent.children.push(node);
    // Feuille SGML : du texte suit la balise ouvrante. Agrégat : aucun texte, on descend.
    if (!text) {
      if (stack.length > MAX_DEPTH) return null;
      stack.push(node);
    }
  }
  return root;
};

const find = (node: Node | undefined, ...tags: string[]): Node | undefined => {
  let current = node;
  for (const tag of tags) current = current?.children.find((c) => c.tag === tag);
  return current;
};
const findAll = (node: Node | undefined, tag: string): Node[] => {
  const out: Node[] = [];
  const walk = (n: Node) => { for (const c of n.children) { if (c.tag === tag) out.push(c); else walk(c); } };
  if (node) walk(node);
  return out;
};
const text = (node: Node | undefined, ...tags: string[]) => find(node, ...tags)?.text ?? "";

/** `AAAAMMJJ[HHMMSS[.XXX]][[±h:TZ]]` → date ISO. */
export const ofxDate = (raw: string): string | null => {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  return match ? isoDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
};

const amountOf = (raw: string, currency: string) => {
  const exponent = exponentOf(currency);
  const value = raw.trim();
  const decimal = value.includes(",") && !value.includes(".") ? "," : ".";
  const canonical = canonicalAmount(value, decimal);
  return exponent === null || canonical === null ? null : decimalToMinor(canonical, exponent);
};

export const parseOfx = (input: string, options: ParseOptions): Effect.Effect<ParsedFile, StatementParseError> =>
  Effect.gen(function* () {
    if (/<!DOCTYPE|<!ENTITY/i.test(input.slice(0, 4096))) return yield* new StatementParseError({ format: "ofx", reason: "unsafe", detail: "DTD ou entité interdite" });
    const tree = ofxTree(input);
    if (!tree) return yield* new StatementParseError({ format: "ofx", reason: "format", detail: "balise <OFX> attendue" });
    const responses = [...findAll(tree, "STMTRS"), ...findAll(tree, "CCSTMTRS")];
    if (responses.length === 0) return yield* new StatementParseError({ format: "ofx", reason: "empty", detail: "aucun relevé (STMTRS)" });
    const statements: ParsedStatement[] = [];
    let lines = 0;
    for (const response of responses) {
      const currency = (text(response, "CURDEF") || options.defaultCurrency).toUpperCase();
      if (exponentOf(currency) === null) return yield* new StatementParseError({ format: "ofx", reason: "currency", detail: currency });
      const account = find(response, "BANKACCTFROM") ?? find(response, "CCACCTFROM");
      const accountIdentifier = nullableText([text(account, "BANKID"), text(account, "BRANCHID"), text(account, "ACCTID")].filter(Boolean).join(""), 34);
      const list = find(response, "BANKTRANLIST");
      const transactions: ParsedTransaction[] = [];
      for (const trn of findAll(list, "STMTTRN")) {
        if (++lines > options.maxLines) return yield* new StatementParseError({ format: "ofx", reason: "too_many_lines", detail: `> ${options.maxLines}` });
        const bookingDate = ofxDate(text(trn, "DTPOSTED")) ?? ofxDate(text(trn, "DTUSER"));
        const minor = amountOf(text(trn, "TRNAMT"), currency);
        if (!bookingDate) return yield* new StatementParseError({ format: "ofx", reason: "date", detail: text(trn, "DTPOSTED") || "DTPOSTED absent" });
        if (minor === null) return yield* new StatementParseError({ format: "ofx", reason: "amount", detail: text(trn, "TRNAMT") });
        const original = find(trn, "ORIGCURRENCY");
        const originalCurrency = text(original, "CURSYM").toUpperCase() || null;
        const rate = text(original, "CURRATE");
        let originalAmountMinor: number | null = null;
        if (originalCurrency && rate && exponentOf(originalCurrency) !== null) {
          const factor = Number(rate.replace(",", "."));
          if (Number.isFinite(factor) && factor > 0) originalAmountMinor = Math.round((minor / factor) * 10 ** (exponentOf(originalCurrency)! - exponentOf(currency)!));
        }
        const name = nullableText(text(trn, "NAME") || text(trn, "PAYEE", "NAME"), 140);
        const memo = cleanText(text(trn, "MEMO"));
        const references = [text(trn, "REFNUM"), text(trn, "CHECKNUM"), text(trn, "SRVRTID")].map((v) => cleanText(v, 35)).filter(Boolean);
        transactions.push(transaction({
          bookingDate, valueDate: ofxDate(text(trn, "DTAVAIL")) ?? ofxDate(text(trn, "DTUSER")), amountMinor: minor, currency,
          originalAmountMinor, originalCurrency: originalAmountMinor === null ? null : originalCurrency,
          label: cleanText([name, memo].filter(Boolean).join(" ")) || text(trn, "TRNTYPE"),
          counterpartyName: name, bankReference: nullableText(text(trn, "FITID"), 64), references, bankCode: nullableText(text(trn, "TRNTYPE"), 16),
        }));
      }
      const ledger = find(response, "LEDGERBAL");
      const closingMinor = ledger ? amountOf(text(ledger, "BALAMT"), currency) : null;
      const closingDate = ofxDate(text(ledger, "DTASOF"));
      const toDate = ofxDate(text(list, "DTEND")) ?? transactions.at(-1)?.bookingDate ?? null;
      const fromDate = ofxDate(text(list, "DTSTART")) ?? transactions[0]?.bookingDate ?? null;
      // Solde d'ouverture déduit seulement si le solde comptable est daté de la fin de la liste.
      const consistent = closingMinor !== null && closingDate !== null && toDate !== null && closingDate >= toDate;
      const opening = consistent ? closingMinor! - transactions.reduce((sum, tx) => sum + tx.amountMinor, 0) : null;
      statements.push({
        format: "ofx", kind: "statement", externalId: null, sequence: null, accountIdentifier, currency, fromDate, toDate,
        openingBalanceMinor: opening, closingBalanceMinor: consistent ? closingMinor : null, transactions,
      });
    }
    return { format: "ofx", statements };
  });
