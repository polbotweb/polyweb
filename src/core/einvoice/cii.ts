/**
 * Sérialisation UN/CEFACT CII D16B (Cross Industry Invoice) au profil Factur-X EN 16931
 * (`urn:cen.eu:en16931:2017`). Ordre des éléments conforme au XSD Factur-X 1.09 ;
 * toutes les valeurs sont échappées. Pur : modèle validé → XML UTF-8.
 */
import { Effect } from "effect";
import { toDecimalString } from "@/core/money";
import type { EInvoiceValidationError } from "./errors";
import type { EInvoice, EInvoiceAddress, EInvoiceParty, EInvoiceTotals } from "./model";
import { canonicalPercent, validateEInvoice } from "./validate";

export const FACTURX_EN16931_GUIDELINE = "urn:cen.eu:en16931:2017";
export const FACTURX_XML_FILENAME = "factur-x.xml";

const NS = {
  rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  qdt: "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
} as const;

// Caractères interdits en XML 1.0 (contrôles C0 hors tab/LF/CR, U+FFFE/U+FFFF, surrogates isolés).
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export const escapeXml = (value: string) =>
  value.replace(INVALID_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const el = (name: string, content: string | null | undefined, attrs: Record<string, string> = {}) => {
  if (content === null || content === undefined || content === "") return "";
  const attributes = Object.entries(attrs).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join("");
  return `<${name}${attributes}>${content}</${name}>`;
};
const text = (name: string, value: string | null | undefined, attrs?: Record<string, string>) =>
  value?.trim() ? el(name, escapeXml(value.trim()), attrs) : "";

const date102 = (value: string) => value.replaceAll("-", "");

export const renderFacturXml = (invoice: EInvoice, totals: EInvoiceTotals): string => {
  const amount = (minor: number) => toDecimalString({ amountMinor: minor, currency: invoice.currency });

  const address = (value: EInvoiceAddress) => el("ram:PostalTradeAddress",
    text("ram:PostcodeCode", value.postcode) + text("ram:LineOne", value.line1) + text("ram:LineTwo", value.line2)
    + text("ram:CityName", value.city) + text("ram:CountryID", value.country));

  const party = (tag: string, value: EInvoiceParty) => el(tag,
    text("ram:Name", value.name)
    + (value.legalId?.value.trim()
      ? el("ram:SpecifiedLegalOrganization", text("ram:ID", value.legalId.value, value.legalId.scheme ? { schemeID: value.legalId.scheme } : {}))
      : "")
    + address(value.address)
    + (value.email?.trim() ? el("ram:URIUniversalCommunication", text("ram:URIID", value.email, { schemeID: "EM" })) : "")
    + (value.vatId?.trim() ? el("ram:SpecifiedTaxRegistration", text("ram:ID", value.vatId, { schemeID: "VA" })) : ""));

  const lines = invoice.lines.map((line) => el("ram:IncludedSupplyChainTradeLineItem",
    el("ram:AssociatedDocumentLineDocument", text("ram:LineID", line.id))
    + el("ram:SpecifiedTradeProduct", text("ram:Name", line.name))
    + el("ram:SpecifiedLineTradeAgreement", el("ram:NetPriceProductTradePrice", el("ram:ChargeAmount", amount(line.unitPriceMinor))))
    + el("ram:SpecifiedLineTradeDelivery", text("ram:BilledQuantity", line.quantity, { unitCode: line.unitCode ?? "C62" }))
    + el("ram:SpecifiedLineTradeSettlement",
      el("ram:ApplicableTradeTax", el("ram:TypeCode", "VAT") + el("ram:CategoryCode", line.vatCategory)
        + el("ram:RateApplicablePercent", canonicalPercent(line.vatRatePercent)))
      + (line.allowanceMinor
        ? el("ram:SpecifiedTradeAllowanceCharge", el("ram:ChargeIndicator", el("udt:Indicator", "false"))
          + el("ram:ActualAmount", amount(line.allowanceMinor)) + el("ram:ReasonCode", "95"))
        : "")
      + el("ram:SpecifiedTradeSettlementLineMonetarySummation", el("ram:LineTotalAmount", amount(line.netMinor))))));

  const vat = totals.vat.map((group) => {
    const reason = invoice.exemptionReasons?.[group.category];
    return el("ram:ApplicableTradeTax",
      el("ram:CalculatedAmount", amount(group.taxMinor)) + el("ram:TypeCode", "VAT")
      + text("ram:ExemptionReason", reason?.text) + el("ram:BasisAmount", amount(group.baseMinor))
      + el("ram:CategoryCode", group.category) + text("ram:ExemptionReasonCode", reason?.code)
      + el("ram:RateApplicablePercent", group.ratePercent));
  }).join("");

  const paymentMeans = invoice.payeeIban?.trim()
    ? el("ram:SpecifiedTradeSettlementPaymentMeans", el("ram:TypeCode", "58")
      + el("ram:PayeePartyCreditorFinancialAccount", text("ram:IBANID", invoice.payeeIban)))
    : "";

  const terms = invoice.paymentTerms?.trim() || invoice.dueDate
    ? el("ram:SpecifiedTradePaymentTerms", text("ram:Description", invoice.paymentTerms)
      + (invoice.dueDate ? el("ram:DueDateDateTime", el("udt:DateTimeString", date102(invoice.dueDate), { format: "102" })) : ""))
    : "";

  const preceding = invoice.precedingInvoice
    ? el("ram:InvoiceReferencedDocument", text("ram:IssuerAssignedID", invoice.precedingInvoice.number)
      + (invoice.precedingInvoice.issueDate
        ? el("ram:FormattedIssueDateTime", el("qdt:DateTimeString", date102(invoice.precedingInvoice.issueDate), { format: "102" }))
        : ""))
    : "";

  const notes = (invoice.notes ?? []).filter((note) => note.trim()).map((note) => el("ram:IncludedNote", text("ram:Content", note))).join("");

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<rsm:CrossIndustryInvoice xmlns:rsm="${NS.rsm}" xmlns:qdt="${NS.qdt}" xmlns:ram="${NS.ram}" xmlns:udt="${NS.udt}">`
    + el("rsm:ExchangedDocumentContext", el("ram:GuidelineSpecifiedDocumentContextParameter", el("ram:ID", FACTURX_EN16931_GUIDELINE)))
    + el("rsm:ExchangedDocument", text("ram:ID", invoice.number) + el("ram:TypeCode", invoice.typeCode)
      + el("ram:IssueDateTime", el("udt:DateTimeString", date102(invoice.issueDate), { format: "102" })) + notes)
    + el("rsm:SupplyChainTradeTransaction",
      lines.join("")
      + el("ram:ApplicableHeaderTradeAgreement", party("ram:SellerTradeParty", invoice.seller) + party("ram:BuyerTradeParty", invoice.buyer))
      + "<ram:ApplicableHeaderTradeDelivery/>"
      + el("ram:ApplicableHeaderTradeSettlement",
        text("ram:PaymentReference", invoice.paymentReference) + el("ram:InvoiceCurrencyCode", invoice.currency)
        + paymentMeans + vat + terms
        + el("ram:SpecifiedTradeSettlementHeaderMonetarySummation",
          el("ram:LineTotalAmount", amount(totals.lineTotalMinor)) + el("ram:TaxBasisTotalAmount", amount(totals.taxBasisMinor))
          + el("ram:TaxTotalAmount", amount(totals.taxMinor), { currencyID: invoice.currency })
          + el("ram:GrandTotalAmount", amount(totals.grandTotalMinor)) + el("ram:DuePayableAmount", amount(totals.duePayableMinor)))
        + preceding))
    + "</rsm:CrossIndustryInvoice>\n";
};

/** Valide (EN 16931) puis sérialise. */
export const buildFacturXml = (invoice: EInvoice): Effect.Effect<{ readonly xml: string; readonly totals: EInvoiceTotals }, EInvoiceValidationError> =>
  Effect.map(validateEInvoice(invoice), (totals) => ({ xml: renderFacturXml(invoice, totals), totals }));
