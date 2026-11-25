/**
 * Lecteur ISO 20022 CAMT.053 (relevé), CAMT.052 (intrajournalier) et CAMT.054 (avis d'opération),
 * versions 001.02 à 001.13 : seuls les noms locaux sont lus (préfixes et espaces de noms variables),
 * et les différences de versions (`Sts` texte ou `Sts/Cd`, `Dbtr/Nm` ou `Dbtr/Pty/Nm`) sont absorbées.
 * Une entrée (`Ntry`) donne une ligne ; un lot (plusieurs `TxDtls`) garde toutes ses références
 * (MsgId, PmtInfId, EndToEndId) pour le lettrage d'un lot SEPA en une fois.
 */
import { Effect } from "effect";
import { child, childrenOf, descendants, parseXml, path, pathText, textOf, type XmlElement } from "@/core/xml";
import type { StatementFormat, StatementKind } from "../constants";
import { StatementParseError } from "../errors";
import { transaction, type ParsedFile, type ParsedStatement, type ParsedTransaction, type ParseOptions } from "./types";
import { cleanText, decimalToMinor, endToEndOrNull, exponentOf, ibanOrNull, isoDateTime, nullableText } from "./values";

const VARIANTS: Record<string, { readonly container: string; readonly item: string; readonly format: StatementFormat; readonly kind: StatementKind }> = {
  BkToCstmrStmt: { container: "BkToCstmrStmt", item: "Stmt", format: "camt053", kind: "statement" },
  BkToCstmrAcctRpt: { container: "BkToCstmrAcctRpt", item: "Rpt", format: "camt052", kind: "intraday" },
  BkToCstmrDbtCdtNtfctn: { container: "BkToCstmrDbtCdtNtfctn", item: "Ntfctn", format: "camt054", kind: "notification" },
};

/** Variante CAMT du document (sans analyse complète), pour la détection. */
export const camtVariant = (xml: string): StatementFormat | null => {
  for (const [tag, variant] of Object.entries(VARIANTS)) if (new RegExp(`<(?:[\\w.-]+:)?${tag}[\\s>]`).test(xml.slice(0, 4096))) return variant.format;
  return null;
};

const dateOf = (element: XmlElement | null) => {
  if (!element) return null;
  return isoDateTime(pathText(element, "Dt") || pathText(element, "DtTm") || textOf(element));
};

const amountOf = (element: XmlElement | null, fallbackCurrency: string): { minor: number; currency: string } | null => {
  if (!element) return null;
  const currency = (element.attrs.Ccy ?? fallbackCurrency).toUpperCase();
  const exponent = exponentOf(currency);
  if (exponent === null) return null;
  const minor = decimalToMinor(textOf(element), exponent);
  return minor === null ? null : { minor, currency };
};

/** Nom d'une partie (v2–v7 : `Nm` ; v8+ : `Pty/Nm`). */
const partyName = (party: XmlElement | null) => nullableText(pathText(party, "Nm") || pathText(party, "Pty", "Nm"), 140);
const partyIban = (account: XmlElement | null) => ibanOrNull(pathText(account, "Id", "IBAN"));

const statusOf = (entry: XmlElement) => (pathText(entry, "Sts", "Cd") || pathText(entry, "Sts")).toUpperCase();

const bankCodeOf = (entry: XmlElement) => {
  const domain = path(entry, "BkTxCd", "Domn");
  if (domain) {
    const family = child(domain, "Fmly");
    return [pathText(domain, "Cd"), pathText(family, "Cd"), pathText(family, "SubFmlyCd")].filter(Boolean).join("/") || null;
  }
  return nullableText(pathText(entry, "BkTxCd", "Prtry", "Cd"), 35);
};

const entryToTransaction = (entry: XmlElement, accountCurrency: string, provisionalKind: boolean, format: StatementFormat): ParsedTransaction | StatementParseError => {
  const amount = amountOf(child(entry, "Amt"), accountCurrency);
  if (!amount) return new StatementParseError({ format, reason: "amount", detail: `montant illisible : ${pathText(entry, "Amt")}` });
  const indicator = pathText(entry, "CdtDbtInd").toUpperCase();
  if (indicator !== "CRDT" && indicator !== "DBIT") return new StatementParseError({ format, reason: "structure", detail: `sens inconnu : ${indicator}` });
  const reversal = pathText(entry, "RvslInd").toLowerCase() === "true";
  // Une contrepassation (RvslInd) inverse le sens affiché.
  const credit = (indicator === "CRDT") !== reversal;
  const bookingDate = dateOf(child(entry, "BookgDt")) ?? dateOf(child(entry, "ValDt"));
  if (!bookingDate) return new StatementParseError({ format, reason: "date", detail: "date comptable absente" });
  const details = descendants(child(entry, "NtryDtls"), "TxDtls");
  const single = details.length === 1 ? details[0]! : null;
  const references = new Set<string>();
  const labels: string[] = [];
  let endToEndId: string | null = null;
  let returnReason: string | null = null;
  let originalAmountMinor: number | null = null;
  let originalCurrency: string | null = null;
  for (const detail of details) {
    const refs = child(detail, "Refs");
    for (const key of ["MsgId", "PmtInfId", "InstrId", "TxId", "MndtId", "ChqNb"]) {
      const value = nullableText(pathText(refs, key), 35);
      if (value && value.toUpperCase() !== "NOTPROVIDED") references.add(value);
    }
    const e2e = endToEndOrNull(pathText(refs, "EndToEndId"));
    if (e2e) { references.add(e2e); endToEndId ??= e2e; }
    for (const ustrd of descendants(child(detail, "RmtInf"), "Ustrd")) { const text = cleanText(textOf(ustrd), 140); if (text) labels.push(text); }
    for (const ref of descendants(child(detail, "RmtInf"), "Ref")) { const value = nullableText(textOf(ref), 35); if (value) references.add(value); }
    const additional = cleanText(pathText(detail, "AddtlTxInf"), 500);
    if (additional) labels.push(additional);
    returnReason ??= nullableText(pathText(detail, "RtrInf", "Rsn", "Cd") || pathText(detail, "RtrInf", "Rsn", "Prtry"), 8);
    if (single) {
      const instructed = amountOf(path(detail, "AmtDtls", "InstdAmt", "Amt"), accountCurrency);
      if (instructed && instructed.currency !== amount.currency) { originalAmountMinor = instructed.minor; originalCurrency = instructed.currency; }
    }
  }
  const entryInfo = cleanText(pathText(entry, "AddtlNtryInf"), 500);
  if (entryInfo) labels.unshift(entryInfo);
  const parties = single ? child(single, "RltdPties") : null;
  const counterpartyName = parties ? partyName(child(parties, credit ? "Dbtr" : "Cdtr")) ?? partyName(child(parties, credit ? "UltmtDbtr" : "UltmtCdtr")) : null;
  const counterpartyIban = parties ? partyIban(child(parties, credit ? "DbtrAcct" : "CdtrAcct")) : null;
  const bankReference = nullableText(pathText(entry, "AcctSvcrRef") || (single ? pathText(single, "Refs", "AcctSvcrRef") : ""), 35);
  const status = statusOf(entry);
  const label = [...new Set(labels)].join(" ").slice(0, 500) || counterpartyName || (credit ? "Crédit" : "Débit");
  return transaction({
    bookingDate,
    valueDate: dateOf(child(entry, "ValDt")),
    amountMinor: credit ? Math.abs(amount.minor) : -Math.abs(amount.minor),
    currency: amount.currency,
    originalAmountMinor: originalAmountMinor === null ? null : credit ? Math.abs(originalAmountMinor) : -Math.abs(originalAmountMinor),
    originalCurrency,
    label,
    counterpartyName,
    counterpartyIban,
    endToEndId,
    bankReference,
    references: [...references].slice(0, 50),
    bankCode: bankCodeOf(entry),
    returnReason,
    provisional: provisionalKind || status === "PDNG" || status === "INFO",
  });
};

const balance = (statement: XmlElement, codes: readonly string[], currency: string) => {
  for (const code of codes) {
    for (const bal of childrenOf(statement, "Bal")) {
      const type = (pathText(bal, "Tp", "CdOrPrtry", "Cd") || pathText(bal, "Tp", "CdOrPrtry", "Prtry")).toUpperCase();
      if (type !== code) continue;
      const amount = amountOf(child(bal, "Amt"), currency);
      if (!amount) return null;
      const sign = pathText(bal, "CdtDbtInd").toUpperCase() === "DBIT" ? -1 : 1;
      return { minor: sign * Math.abs(amount.minor), date: dateOf(child(bal, "Dt")) };
    }
  }
  return null;
};

export const parseCamt = (xml: string, options: ParseOptions): Effect.Effect<ParsedFile, StatementParseError> =>
  Effect.gen(function* () {
    const root = yield* parseXml(xml).pipe(Effect.mapError((error) => new StatementParseError({ format: "camt053", reason: error.reason === "doctype" || error.reason === "entity" ? "unsafe" : "format", detail: error.detail })));
    const document = root.local === "Document" ? root : null;
    const containerEntry = document ? Object.entries(VARIANTS).find(([tag]) => child(document, tag)) : undefined;
    if (!document || !containerEntry) return yield* new StatementParseError({ format: "camt053", reason: "format", detail: "document ISO 20022 CAMT attendu" });
    const variant = containerEntry[1];
    const container = child(document, variant.container)!;
    const statements: ParsedStatement[] = [];
    let lines = 0;
    for (const item of childrenOf(container, variant.item)) {
      const account = child(item, "Acct");
      const currency = (pathText(account, "Ccy") || options.defaultCurrency).toUpperCase();
      if (exponentOf(currency) === null) return yield* new StatementParseError({ format: variant.format, reason: "currency", detail: currency });
      const transactions: ParsedTransaction[] = [];
      for (const entry of childrenOf(item, "Ntry")) {
        if (++lines > options.maxLines) return yield* new StatementParseError({ format: variant.format, reason: "too_many_lines", detail: `> ${options.maxLines}` });
        const parsed = entryToTransaction(entry, currency, variant.kind !== "statement", variant.format);
        if (parsed instanceof StatementParseError) return yield* parsed;
        transactions.push(parsed);
      }
      const opening = balance(item, ["OPBD", "PRCD", "OPAV"], currency);
      const closing = balance(item, ["CLBD", "ITBD", "CLAV"], currency);
      const period = child(item, "FrToDt");
      statements.push({
        format: variant.format,
        kind: variant.kind,
        externalId: nullableText(pathText(item, "Id"), 35),
        sequence: nullableText(pathText(item, "ElctrncSeqNb") || pathText(item, "LglSeqNb"), 35),
        accountIdentifier: ibanOrNull(pathText(account, "Id", "IBAN")) ?? nullableText(pathText(account, "Id", "Othr", "Id"), 34),
        currency,
        fromDate: isoDateTime(pathText(period, "FrDtTm")) ?? opening?.date ?? transactions[0]?.bookingDate ?? null,
        toDate: isoDateTime(pathText(period, "ToDtTm")) ?? closing?.date ?? transactions.at(-1)?.bookingDate ?? null,
        openingBalanceMinor: variant.kind === "statement" ? opening?.minor ?? null : null,
        closingBalanceMinor: variant.kind === "statement" ? closing?.minor ?? null : null,
        transactions,
      });
    }
    if (statements.length === 0) return yield* new StatementParseError({ format: variant.format, reason: "empty", detail: "aucun relevé" });
    return { format: variant.format, statements };
  });
