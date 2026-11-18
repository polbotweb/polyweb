/**
 * Lecture d'une facture électronique EN 16931 déjà en XML : CII (Factur-X / Cross Industry Invoice)
 * ou UBL Invoice. Aucune dépendance, DTD / entités externes refusés (prévention XXE).
 */
import { Data, Effect } from "effect";
import { assertSafeXml, decodeXmlEntities } from "@/core/xml";

export class EInvoiceParseError extends Data.TaggedError("EInvoiceParseError")<{
  readonly reason: "empty" | "doctype" | "format" | "amount" | "lines";
  readonly detail: string;
}> {
  override get message() {
    return `Facture électronique illisible (${this.reason}) : ${this.detail}`;
  }
}

export type IncomingInvoiceFormat = "cii" | "ubl";

export interface IncomingInvoiceLine {
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly netMinor: number;
  readonly vatRatePercent: string;
}

export interface IncomingInvoice {
  readonly format: IncomingInvoiceFormat;
  readonly number: string;
  readonly issueDate: string;
  readonly currency: string;
  readonly sellerName: string;
  readonly sellerVat: string | null;
  readonly sellerIban: string | null;
  readonly buyerName: string | null;
  readonly netMinor: number;
  readonly taxMinor: number;
  readonly grossMinor: number;
  readonly lines: readonly IncomingInvoiceLine[];
}

/** Entités prédéfinies et numériques (core/xml) ; une entité inconnue est laissée telle quelle. */
const decode = (value: string) => (decodeXmlEntities(value) ?? value).trim();

const texts = (xml: string, name: string): string[] => {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "gi");
  return [...xml.matchAll(re)].map((match) => decode(match[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
};

const first = (xml: string, names: readonly string[]) => {
  for (const name of names) {
    const value = texts(xml, name)[0];
    if (value) return value;
  }
  return "";
};

const attrOf = (xml: string, name: string, attribute: string) => {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}[^>]*\\s${attribute}="([^"]*)"`, "i");
  return decode(re.exec(xml)?.[1] ?? "");
};

const dateOf = (raw: string) => {
  const compact = raw.replace(/[^\d]/g, "");
  if (/^\d{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return "";
};

const expOf = (currency: string) => (currency === "JPY" ? 0 : currency === "KWD" ? 3 : 2);

const minorOf = (decimal: string, currency: string): number | null => {
  const trimmed = decimal.trim().replace(",", ".").replace(/\s/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const exp = expOf(currency);
  const [int = "0", frac = ""] = trimmed.split(".");
  const n = Number(int) * 10 ** exp + Number((frac + "000").slice(0, exp) || "0") * (int.startsWith("-") && Number(int) === 0 ? -1 : 1);
  return Number.isSafeInteger(n) ? n : null;
};

const detect = (xml: string): IncomingInvoiceFormat | null => {
  if (/CrossIndustryInvoice|ram:SellerTradeParty|rsm:SupplyChainTradeTransaction/i.test(xml)) return "cii";
  if (/<Invoice\b|AccountingSupplierParty|cbc:PayableAmount/i.test(xml)) return "ubl";
  return null;
};

const parseCii = (xml: string): IncomingInvoice | EInvoiceParseError => {
  const currency = attrOf(xml, "GrandTotalAmount", "currencyID") || attrOf(xml, "TaxBasisTotalAmount", "currencyID") || first(xml, ["InvoiceCurrencyCode"]) || "EUR";
  const number = first(xml, ["ID"]) || first(xml.replace(/[\s\S]*SellerTradeParty[\s\S]*?<\/(?:[\w.-]+:)?SellerTradeParty>/i, xml), ["ID"]);
  // Prefer ExchangedDocument ID: take first ID after ExchangedDocument if possible.
  const exchanged = /<(?:[\w.-]+:)?ExchangedDocument\b[\s\S]*?<\/(?:[\w.-]+:)?ExchangedDocument>/i.exec(xml)?.[0] ?? xml;
  const invoiceNumber = first(exchanged, ["ID"]) || number;
  const issueDate = dateOf(first(exchanged, ["DateTimeString", "IssueDateTime"]) || first(xml, ["DateTimeString"]));
  const sellerBlock = /<(?:[\w.-]+:)?SellerTradeParty\b[\s\S]*?<\/(?:[\w.-]+:)?SellerTradeParty>/i.exec(xml)?.[0] ?? "";
  const buyerBlock = /<(?:[\w.-]+:)?BuyerTradeParty\b[\s\S]*?<\/(?:[\w.-]+:)?BuyerTradeParty>/i.exec(xml)?.[0] ?? "";
  const sellerName = first(sellerBlock, ["Name"]);
  const sellerVat = first(sellerBlock, ["ID"]) && /schemeID="VA"/i.test(sellerBlock)
    ? (sellerBlock.match(/schemeID="VA"[^>]*>\s*([^<]+)/i)?.[1] ?? first(sellerBlock, ["ID"]))
    : (sellerBlock.match(/schemeID="VA"[^>]*>\s*([^<]+)/i)?.[1] ?? null);
  const sellerIban = first(xml, ["IBANID"]) || null;
  const netMinor = minorOf(first(xml, ["TaxBasisTotalAmount"]) || "0", currency);
  const taxMinor = minorOf(first(xml, ["TaxTotalAmount"]) || "0", currency);
  const grossMinor = minorOf(first(xml, ["GrandTotalAmount"]) || "0", currency);
  const lineBlocks = xml.split(/<(?:[\w.-]+:)?IncludedSupplyChainTradeLineItem\b/i).slice(1);
  const lines: IncomingInvoiceLine[] = [];
  for (const block of lineBlocks) {
    const name = first(block, ["Name", "Description"]) || "Ligne";
    const qtyRaw = first(block, ["BilledQuantity"]) || "1";
    const quantity = Number(qtyRaw.replace(",", "."));
    const unit = minorOf(first(block, ["ChargeAmount"]) || "0", currency) ?? 0;
    const net = minorOf(first(block, ["LineTotalAmount"]) || "0", currency) ?? unit * quantity;
    const vat = first(block, ["RateApplicablePercent"]) || "0";
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    lines.push({ name, quantity, unitPriceMinor: unit, netMinor: net, vatRatePercent: vat });
  }
  if (!invoiceNumber || !issueDate || netMinor === null || taxMinor === null || grossMinor === null) {
    return new EInvoiceParseError({ reason: "format", detail: "entête CII incomplet" });
  }
  if (lines.length === 0) return new EInvoiceParseError({ reason: "lines", detail: "aucune ligne" });
  return {
    format: "cii", number: invoiceNumber, issueDate, currency: currency.toUpperCase(),
    sellerName: sellerName || "Fournisseur", sellerVat: sellerVat?.trim() || null, sellerIban: sellerIban?.trim() || null,
    buyerName: first(buyerBlock, ["Name"]) || null, netMinor, taxMinor, grossMinor, lines,
  };
};

const parseUbl = (xml: string): IncomingInvoice | EInvoiceParseError => {
  const supplier = /<(?:[\w.-]+:)?AccountingSupplierParty\b[\s\S]*?<\/(?:[\w.-]+:)?AccountingSupplierParty>/i.exec(xml)?.[0] ?? "";
  const customer = /<(?:[\w.-]+:)?AccountingCustomerParty\b[\s\S]*?<\/(?:[\w.-]+:)?AccountingCustomerParty>/i.exec(xml)?.[0] ?? "";
  const currency = attrOf(xml, "PayableAmount", "currencyID") || attrOf(xml, "TaxInclusiveAmount", "currencyID") || first(xml, ["DocumentCurrencyCode"]) || "EUR";
  const invoiceNumber = first(xml, ["ID"]);
  const issueDate = dateOf(first(xml, ["IssueDate"]));
  const sellerName = first(supplier, ["RegistrationName", "Name"]);
  const sellerVat = first(supplier, ["CompanyID"]) || null;
  const sellerIban = first(xml, ["ID"]); // too broad; prefer PaymentMeans
  const means = /<(?:[\w.-]+:)?PaymentMeans\b[\s\S]*?<\/(?:[\w.-]+:)?PaymentMeans>/i.exec(xml)?.[0] ?? "";
  const iban = first(means, ["ID"]) || null;
  const netMinor = minorOf(first(xml, ["TaxExclusiveAmount", "LineExtensionAmount"]) || "0", currency);
  const taxMinor = minorOf(first(xml, ["TaxAmount"]) || "0", currency);
  const grossMinor = minorOf(first(xml, ["PayableAmount", "TaxInclusiveAmount"]) || "0", currency);
  const lineBlocks = xml.split(/<(?:[\w.-]+:)?InvoiceLine\b/i).slice(1);
  const lines: IncomingInvoiceLine[] = [];
  for (const block of lineBlocks) {
    const name = first(block, ["Name", "Description"]) || "Ligne";
    const quantity = Number((first(block, ["InvoicedQuantity"]) || "1").replace(",", "."));
    const unit = minorOf(first(block, ["PriceAmount"]) || "0", currency) ?? 0;
    const net = minorOf(first(block, ["LineExtensionAmount"]) || "0", currency) ?? unit * quantity;
    const vat = first(block, ["Percent"]) || "0";
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    lines.push({ name, quantity, unitPriceMinor: unit, netMinor: net, vatRatePercent: vat });
  }
  if (!invoiceNumber || !issueDate || netMinor === null || taxMinor === null || grossMinor === null) {
    return new EInvoiceParseError({ reason: "format", detail: "entête UBL incomplet" });
  }
  if (lines.length === 0) return new EInvoiceParseError({ reason: "lines", detail: "aucune ligne" });
  return {
    format: "ubl", number: invoiceNumber, issueDate, currency: currency.toUpperCase(),
    sellerName: sellerName || "Fournisseur", sellerVat: sellerVat?.trim() || null, sellerIban: iban ?? (sellerIban || null),
    buyerName: first(customer, ["RegistrationName", "Name"]) || null, netMinor, taxMinor, grossMinor, lines,
  };
};

/** Parse un XML CII ou UBL (facture fournisseur entrante). */
export const parseIncomingInvoiceXml = (xml: string): Effect.Effect<IncomingInvoice, EInvoiceParseError> => {
  const raw = xml?.trim() ?? "";
  if (!raw) return Effect.fail(new EInvoiceParseError({ reason: "empty", detail: "document vide" }));
  return assertSafeXml(raw).pipe(
    Effect.mapError(() => new EInvoiceParseError({ reason: "doctype", detail: "DTD ou entité interdite" })),
    Effect.flatMap((safe) => {
      const format = detect(safe);
      if (!format) return Effect.fail(new EInvoiceParseError({ reason: "format", detail: "ni CII ni UBL" }));
      const parsed = format === "cii" ? parseCii(safe) : parseUbl(safe);
      return parsed instanceof EInvoiceParseError ? Effect.fail(parsed) : Effect.succeed(parsed);
    }),
  );
};
