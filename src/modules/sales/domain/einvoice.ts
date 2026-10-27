/**
 * Document de vente émis (facture / avoir) + profil vendeur → modèle EN 16931 (`@/core/einvoice`).
 * Pur. Catégorie TVA (UNCL 5305) : mention d'autoliquidation → AE, livraison intracommunautaire → K,
 * export → G, sinon taux > 0 → S, catégorie `exempt` → E, taux nul → Z. Les totaux recalculés par
 * core/einvoice doivent égaler les totaux figés du document : sinon aucun XML (le XML ne peut pas
 * contredire le PDF visuel).
 */
import { Effect } from "effect";
import { buildFacturXml, canonicalPercent, type EInvoice, type EInvoiceLine, type VatCategoryCode } from "@/core/einvoice";
import { isCurrencyCode, multiply } from "@/core/money";
import { legalMention, type TaxMention } from "@/modules/tax/domain/rules";
import { FacturXUnavailableError } from "./errors";
import type { SellerProfile } from "./seller-profile";

export interface SalesEInvoiceSource {
  readonly kind: string;
  readonly status: string;
  readonly number: string | null;
  readonly issueDate: string | null;
  readonly dueDate: string | null;
  readonly currency: string;
  readonly customerName: string;
  readonly customerEmail: string | null;
  readonly customerAddress: string | null;
  readonly customerCountry: string;
  readonly customerVatNumber: string | null;
  readonly taxMention: string | null;
  readonly notes: string | null;
  readonly netMinor: number;
  readonly taxMinor: number;
  readonly grossMinor: number;
  readonly sourceDocumentId: string | null;
  readonly lines: readonly { readonly description: string; readonly quantity: string; readonly unitPriceMinor: number; readonly taxCategory: string; readonly ratePercent: string; readonly netMinor: number }[];
  readonly related: readonly { readonly id: string; readonly number: string | null }[];
}

const MENTION_CATEGORY: Record<TaxMention, VatCategoryCode> = {
  "reverse-charge-services": "AE",
  "intra-eu-goods-exempt": "K",
  "export-exempt": "G",
};
const VATEX: Partial<Record<VatCategoryCode, string>> = { AE: "VATEX-EU-AE", K: "VATEX-EU-IC", G: "VATEX-EU-G" };
const EXEMPT_TEXT: Record<string, string> = { fr: "Exonération de TVA", en: "VAT exempt", es: "Exento de IVA", ar: "معفى من الضريبة" };
/** BT-20 d'un avoir (BR-CO-25 : montant dû positif → échéance ou conditions). */
const CREDIT_TERMS: Record<string, string> = { fr: "Avoir à imputer ou à rembourser", en: "Credit to be offset or refunded", es: "Abono a compensar o reembolsar", ar: "إشعار دائن للخصم أو الاسترداد" };
const NOT_ISSUED = new Set(["DRAFT", "CANCELLED"]);

const unavailable = (reason: FacturXUnavailableError["reason"], detail?: string) => Effect.fail(new FacturXUnavailableError({ reason, detail }));
const isMention = (value: string | null): value is TaxMention => value !== null && value in MENTION_CATEGORY;
const normalizeVat = (value: string | null) => value?.replace(/[\s.-]/g, "").toUpperCase() || null;

const categoryOf = (mention: TaxMention | null, line: SalesEInvoiceSource["lines"][number]): VatCategoryCode => {
  if (mention) return MENTION_CATEGORY[mention];
  if (Number(line.ratePercent) > 0) return "S";
  return line.taxCategory === "exempt" ? "E" : "Z";
};

/** Adresse libre multi-lignes → ligne 1 + ligne 2 (reste joint) ; pays ISO du document. */
const addressOf = (address: string | null, country: string) => {
  const lines = (address ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { line1: lines[0] ?? null, line2: lines.length > 1 ? lines.slice(1).join(", ") : null, country: country.toUpperCase() };
};

export const salesToEInvoice = (doc: SalesEInvoiceSource, seller: SellerProfile | null, locale: string): Effect.Effect<EInvoice, FacturXUnavailableError> =>
  Effect.gen(function* () {
    const typeCode = doc.kind === "invoice" ? "380" : doc.kind === "credit_note" ? "381" : null;
    if (!typeCode) return yield* unavailable("not-invoice", doc.kind);
    if (!doc.number || !doc.issueDate || NOT_ISSUED.has(doc.status)) return yield* unavailable("not-issued", doc.status);
    if (!seller) return yield* unavailable("no-seller-profile");
    const currency = doc.currency.toUpperCase();
    if (!isCurrencyCode(currency)) return yield* unavailable("unsupported-currency", doc.currency);
    const mention = isMention(doc.taxMention) ? doc.taxMention : null;

    const lines: EInvoiceLine[] = [];
    for (const [index, line] of doc.lines.entries()) {
      const gross = yield* multiply({ amountMinor: line.unitPriceMinor, currency }, String(Number(line.quantity)), "half-up").pipe(
        Effect.mapError((error) => new FacturXUnavailableError({ reason: "invalid", detail: `line ${index + 1}: ${error.message}` })),
      );
      const allowanceMinor = gross.amountMinor - line.netMinor;
      if (allowanceMinor < 0) return yield* unavailable("totals-mismatch", `line ${index + 1}`);
      lines.push({
        id: String(index + 1),
        name: line.description,
        quantity: String(Number(line.quantity)),
        unitPriceMinor: line.unitPriceMinor,
        ...(allowanceMinor > 0 ? { allowanceMinor } : {}),
        netMinor: line.netMinor,
        vatCategory: categoryOf(mention, line),
        vatRatePercent: canonicalPercent(line.ratePercent),
      });
    }

    const exemptionReasons: NonNullable<EInvoice["exemptionReasons"]> = {};
    for (const category of new Set(lines.map((line) => line.vatCategory))) {
      if (category === "AE" || category === "K" || category === "G") exemptionReasons[category] = { code: VATEX[category], text: mention ? legalMention(mention, locale) : null };
      if (category === "E") exemptionReasons.E = { text: EXEMPT_TEXT[locale] ?? EXEMPT_TEXT.fr };
    }
    const source = doc.sourceDocumentId ? doc.related.find((related) => related.id === doc.sourceDocumentId) : undefined;

    return {
      typeCode,
      number: doc.number,
      issueDate: doc.issueDate,
      currency,
      seller: {
        name: seller.legalName,
        vatId: seller.vatNumber,
        legalId: seller.legalId ? { value: seller.legalId, scheme: seller.legalIdScheme } : null,
        address: { line1: seller.addressLine1, line2: seller.addressLine2, postcode: seller.postcode, city: seller.city, country: seller.country },
        email: seller.email,
      },
      buyer: {
        name: doc.customerName,
        vatId: normalizeVat(doc.customerVatNumber),
        address: addressOf(doc.customerAddress, doc.customerCountry),
        email: doc.customerEmail,
      },
      lines,
      dueDate: typeCode === "380" ? doc.dueDate : null,
      paymentTerms: typeCode === "381" ? (CREDIT_TERMS[locale] ?? CREDIT_TERMS.fr) : null,
      payeeIban: typeCode === "380" ? seller.iban : null,
      paymentReference: typeCode === "380" ? doc.number : null,
      notes: [...(mention ? [legalMention(mention, locale)] : []), ...(doc.notes?.trim() ? [doc.notes.trim()] : [])],
      exemptionReasons,
      precedingInvoice: typeCode === "381" && source?.number ? { number: source.number } : null,
    } satisfies EInvoice;
  });

/** XML Factur-X d'un document émis ; totaux contrôlés contre les totaux figés du document. */
export const salesFacturXml = (doc: SalesEInvoiceSource, seller: SellerProfile | null, locale: string) =>
  Effect.gen(function* () {
    const invoice = yield* salesToEInvoice(doc, seller, locale);
    const { xml, totals } = yield* buildFacturXml(invoice).pipe(
      Effect.mapError((error) => new FacturXUnavailableError({ reason: "invalid", detail: `${error.rule}: ${error.detail}` })),
    );
    if (totals.taxBasisMinor !== doc.netMinor || totals.taxMinor !== doc.taxMinor || totals.grandTotalMinor !== doc.grossMinor) {
      return yield* unavailable("totals-mismatch", `${totals.taxBasisMinor}/${totals.taxMinor}/${totals.grandTotalMinor} ≠ ${doc.netMinor}/${doc.taxMinor}/${doc.grossMinor}`);
    }
    return { invoice, xml, totals };
  });
