/**
 * Totaux et contrôles EN 16931 (sous-ensemble des règles métier `BR-*`, `BR-CO-*` et des
 * règles par catégorie de TVA) appliqués avant la génération du XML. Pur, sans I/O.
 */
import { Effect } from "effect";
import { isCurrencyCode, percentage } from "@/core/money";
import { EInvoiceValidationError } from "./errors";
import { VAT_CATEGORY_CODES, type EInvoice, type EInvoiceTotals, type EInvoiceVatBreakdown, type VatCategoryCode } from "./model";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,4})?$/;
const COUNTRY = /^[A-Z]{2}$/;
const UNIT_CODE = /^[A-Z0-9]{1,3}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

const fail = (rule: string, detail: string) => Effect.fail(new EInvoiceValidationError({ rule, detail }));

const isDate = (value: string) => {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/** Taux canonique (« 20.00 » → « 20 », « 5.50 » → « 5.5 »). */
export const canonicalPercent = (value: string) => {
  const [int, frac = ""] = value.split(".");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${int}.${trimmed}` : int;
};

/** Catégories sans TVA facturée : taux 0 obligatoire (BR-Z-05, BR-E-05, BR-AE-05, BR-IC-05, BR-G-05, BR-O-05). */
const ZERO_RATE: ReadonlySet<VatCategoryCode> = new Set(["Z", "E", "AE", "K", "G", "O"]);
/** Catégories exigeant un motif d'exonération (BR-E-10, BR-AE-10, BR-IC-10, BR-G-10, BR-O-10). */
const NEEDS_REASON: ReadonlySet<VatCategoryCode> = new Set(["E", "AE", "K", "G", "O"]);

/** Ventilation par (catégorie, taux), TVA arrondie half-up par groupe, puis totaux (BR-CO-10 à BR-CO-16). */
export const computeEInvoiceTotals = (invoice: EInvoice) =>
  Effect.gen(function* () {
    const groups = new Map<string, { category: VatCategoryCode; ratePercent: string; baseMinor: number }>();
    for (const line of invoice.lines) {
      const ratePercent = canonicalPercent(line.vatRatePercent);
      const key = `${line.vatCategory}|${ratePercent}`;
      const group = groups.get(key) ?? { category: line.vatCategory, ratePercent, baseMinor: 0 };
      groups.set(key, { ...group, baseMinor: group.baseMinor + line.netMinor });
    }
    const vat: EInvoiceVatBreakdown[] = [];
    for (const group of groups.values()) {
      const tax = yield* percentage({ amountMinor: group.baseMinor, currency: invoice.currency }, group.ratePercent, "half-up");
      vat.push({ ...group, taxMinor: tax.amountMinor });
    }
    vat.sort((a, b) => a.category.localeCompare(b.category) || Number(a.ratePercent) - Number(b.ratePercent));
    const lineTotalMinor = invoice.lines.reduce((total, line) => total + line.netMinor, 0);
    const taxMinor = vat.reduce((total, group) => total + group.taxMinor, 0);
    const grandTotalMinor = lineTotalMinor + taxMinor;
    return { lineTotalMinor, taxBasisMinor: lineTotalMinor, taxMinor, grandTotalMinor, duePayableMinor: grandTotalMinor, vat } satisfies EInvoiceTotals;
  });

const validateParty = (role: "seller" | "buyer", invoice: EInvoice) => {
  const party = invoice[role];
  const [nameRule, countryRule] = role === "seller" ? ["BR-06", "BR-09"] : ["BR-07", "BR-11"];
  if (!party.name.trim()) return fail(nameRule, `${role}.name`);
  if (!COUNTRY.test(party.address.country)) return fail(countryRule, `${role}.address.country`);
  if (party.legalId && !party.legalId.value.trim()) return fail(role === "seller" ? "BT-30" : "BT-47", `${role}.legalId`);
  return Effect.void;
};

/** Contrôle le document ; renvoie les totaux calculés. */
export const validateEInvoice = (invoice: EInvoice): Effect.Effect<EInvoiceTotals, EInvoiceValidationError> =>
  Effect.gen(function* () {
    if (!invoice.number.trim()) return yield* fail("BR-02", "number");
    if (!isDate(invoice.issueDate)) return yield* fail("BR-03", "issueDate");
    if (invoice.typeCode !== "380" && invoice.typeCode !== "381") return yield* fail("BR-04", "typeCode");
    if (!isCurrencyCode(invoice.currency)) return yield* fail("BR-05", "currency");
    yield* validateParty("seller", invoice);
    yield* validateParty("buyer", invoice);
    if (!invoice.seller.vatId?.trim() && !invoice.seller.legalId?.value.trim()) return yield* fail("BR-CO-26", "seller.vatId|seller.legalId");
    if (invoice.lines.length === 0) return yield* fail("BR-16", "lines");
    if (invoice.dueDate && !isDate(invoice.dueDate)) return yield* fail("BT-9", "dueDate");
    if (invoice.payeeIban && !IBAN.test(invoice.payeeIban)) return yield* fail("BT-84", "payeeIban");
    if (invoice.precedingInvoice && !invoice.precedingInvoice.number.trim()) return yield* fail("BR-55", "precedingInvoice.number");
    if (invoice.precedingInvoice?.issueDate && !isDate(invoice.precedingInvoice.issueDate)) return yield* fail("BT-26", "precedingInvoice.issueDate");

    const ids = new Set<string>();
    for (const [index, line] of invoice.lines.entries()) {
      const at = `lines[${index}]`;
      if (!line.id.trim() || ids.has(line.id)) return yield* fail("BR-21", `${at}.id`);
      ids.add(line.id);
      if (!line.name.trim()) return yield* fail("BR-25", `${at}.name`);
      if (!DECIMAL.test(line.quantity) || Number(line.quantity) <= 0) return yield* fail("BR-22", `${at}.quantity`);
      if (line.unitCode !== undefined && !UNIT_CODE.test(line.unitCode)) return yield* fail("BR-23", `${at}.unitCode`);
      if (!Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) return yield* fail("BR-27", `${at}.unitPriceMinor`);
      if (!Number.isSafeInteger(line.netMinor)) return yield* fail("BR-24", `${at}.netMinor`);
      if (line.allowanceMinor !== undefined && (!Number.isSafeInteger(line.allowanceMinor) || line.allowanceMinor < 0)) return yield* fail("BR-41", `${at}.allowanceMinor`);
      if (!(VAT_CATEGORY_CODES as readonly string[]).includes(line.vatCategory)) return yield* fail("BR-CO-04", `${at}.vatCategory`);
      if (!DECIMAL.test(line.vatRatePercent) || Number(line.vatRatePercent) > 100) return yield* fail("BR-CO-04", `${at}.vatRatePercent`);
      const zero = Number(line.vatRatePercent) === 0;
      if (ZERO_RATE.has(line.vatCategory) && !zero) return yield* fail(`BR-${line.vatCategory}-05`, `${at}.vatRatePercent`);
      if (line.vatCategory === "S" && zero) return yield* fail("BR-S-05", `${at}.vatRatePercent`);
    }

    const categories = new Set(invoice.lines.map((line) => line.vatCategory));
    const sellerVat = Boolean(invoice.seller.vatId?.trim());
    const buyerVat = Boolean(invoice.buyer.vatId?.trim());
    for (const category of categories) {
      if (["S", "Z", "E", "AE", "K", "G"].includes(category) && !sellerVat) return yield* fail(`BR-${category === "K" ? "IC" : category}-02`, "seller.vatId");
      if ((category === "AE" || category === "K") && !buyerVat) return yield* fail(`BR-${category === "K" ? "IC" : category}-02`, "buyer.vatId");
      if (category === "O" && sellerVat) return yield* fail("BR-O-02", "seller.vatId");
      const reason = invoice.exemptionReasons?.[category];
      if (NEEDS_REASON.has(category) && !reason?.text?.trim() && !reason?.code?.trim()) return yield* fail(`BR-${category === "K" ? "IC" : category}-10`, `exemptionReasons.${category}`);
    }

    const totals = yield* computeEInvoiceTotals(invoice).pipe(
      Effect.mapError((cause) => new EInvoiceValidationError({ rule: "BR-CO-17", detail: String(cause) })),
    );
    if (totals.duePayableMinor > 0 && !invoice.dueDate && !invoice.paymentTerms?.trim()) return yield* fail("BR-CO-25", "dueDate|paymentTerms");
    return totals;
  });
