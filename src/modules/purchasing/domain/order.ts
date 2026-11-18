/**
 * Validation des fournisseurs et commandes fournisseur. Prix unitaires saisis en décimal,
 * convertis en unités mineures (core/money, arrondi commercial) ; montant de ligne =
 * quantité × prix unitaire ; total HT = somme des lignes (même devise).
 */
import { Effect } from "effect";
import { fromDecimal, multiply, parseCurrency, sum, type CurrencyCode } from "@/core/money";
import { isValidBic, isValidIban, normalizeBic, normalizeIban } from "@/core/sepa/iban";
import { InvalidPurchaseOrderError, InvalidSupplierError } from "./errors";

export const MAX_LINES = 200;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const isCountry = (value: string) => /^[A-Z]{2}$/.test(value);
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export interface SupplierFields {
  readonly code: string;
  readonly name: string;
  readonly email: string | null;
  readonly country: string | null;
  readonly paymentTermDays: number;
  readonly iban?: string | null;
  readonly bic?: string | null;
  readonly sepaName?: string | null;
  readonly crmCompanyId?: string | null;
  readonly crmContactId?: string | null;
  readonly trustedCatalogue?: boolean;
  readonly punchoutEnabled?: boolean;
  readonly punchoutSetupUrl?: string | null;
  readonly punchoutIdentity?: string | null;
  readonly punchoutDomain?: string | null;
  readonly punchoutSecret?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

export const validateSupplier = (input: SupplierFields) =>
  Effect.gen(function* () {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(code)) return yield* new InvalidSupplierError({ field: "code", value: input.code });
    const name = input.name.trim();
    if (name === "" || name.length > 200) return yield* new InvalidSupplierError({ field: "name", value: input.name });
    const email = input.email?.trim().toLowerCase() || null;
    if (email !== null && !isEmail(email)) return yield* new InvalidSupplierError({ field: "email", value: input.email ?? "" });
    const country = input.country?.trim().toUpperCase() || null;
    if (country !== null && !isCountry(country)) return yield* new InvalidSupplierError({ field: "country", value: input.country ?? "" });
    if (!Number.isSafeInteger(input.paymentTermDays) || input.paymentTermDays < 0 || input.paymentTermDays > 365) {
      return yield* new InvalidSupplierError({ field: "paymentTerms", value: String(input.paymentTermDays) });
    }
    const iban = input.iban?.trim() ? normalizeIban(input.iban) : null;
    if (iban && !isValidIban(iban)) return yield* new InvalidSupplierError({ field: "iban", value: input.iban ?? "" });
    const bic = input.bic?.trim() ? normalizeBic(input.bic) : null;
    if (bic && !isValidBic(bic)) return yield* new InvalidSupplierError({ field: "bic", value: input.bic ?? "" });
    const sepaName = input.sepaName?.trim() || null;
    if (sepaName && sepaName.length > 70) return yield* new InvalidSupplierError({ field: "sepaName", value: sepaName });
    const crmCompanyId = input.crmCompanyId?.trim() || null;
    if (crmCompanyId && !UUID.test(crmCompanyId)) return yield* new InvalidSupplierError({ field: "crmCompanyId", value: crmCompanyId });
    const crmContactId = input.crmContactId?.trim() || null;
    if (crmContactId && !UUID.test(crmContactId)) return yield* new InvalidSupplierError({ field: "crmContactId", value: crmContactId });
    const punchoutEnabled = input.punchoutEnabled ?? false;
    const punchoutSetupUrl = input.punchoutSetupUrl?.trim() || null;
    if (punchoutSetupUrl && !isHttpUrl(punchoutSetupUrl)) return yield* new InvalidSupplierError({ field: "punchoutSetupUrl", value: punchoutSetupUrl });
    if (punchoutEnabled && !punchoutSetupUrl) return yield* new InvalidSupplierError({ field: "punchoutSetupUrl", value: "" });
    const punchoutIdentity = input.punchoutIdentity?.trim() || null;
    const punchoutDomain = input.punchoutDomain?.trim() || null;
    const punchoutSecret = input.punchoutSecret?.trim() || null;
    if (punchoutIdentity && punchoutIdentity.length > 200) return yield* new InvalidSupplierError({ field: "punchoutIdentity", value: punchoutIdentity });
    if (punchoutDomain && punchoutDomain.length > 200) return yield* new InvalidSupplierError({ field: "punchoutDomain", value: punchoutDomain });
    return {
      code, name, email, country, paymentTermDays: input.paymentTermDays,
      iban, bic, sepaName, crmCompanyId, crmContactId,
      trustedCatalogue: input.trustedCatalogue ?? false,
      punchoutEnabled, punchoutSetupUrl, punchoutIdentity, punchoutDomain, punchoutSecret,
    };
  });

export const ORDER_LINE_KINDS = ["stock", "service"] as const;
export type OrderLineKind = (typeof ORDER_LINE_KINDS)[number];

export interface PurchaseOrderLineInput {
  readonly sku?: string | null;
  readonly description?: string | null;
  readonly quantity: number;
  /** Prix unitaire HT en décimal (« 12.50 »). */
  readonly unitPrice: string;
  readonly kind?: OrderLineKind;
  readonly warehouseId?: string | null;
}

export interface PurchaseOrderFields {
  readonly currency: string;
  readonly expectedDate: string | null;
  readonly lines: readonly PurchaseOrderLineInput[];
}

export interface ValidatedLine {
  readonly position: number;
  readonly sku: string;
  readonly description: string | null;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly netMinor: number;
  readonly kind: OrderLineKind;
  readonly warehouseId: string | null;
}

const validateLine = (currency: CurrencyCode) => (line: PurchaseOrderLineInput, index: number) =>
  Effect.gen(function* () {
    const kind: OrderLineKind = line.kind === "service" ? "service" : "stock";
    const description = line.description?.trim() || null;
    const position = index + 1;
    const rawSku = line.sku?.trim().toUpperCase() || (kind === "service" ? `SVC-${position}` : "");
    if (!SKU.test(rawSku)) return yield* new InvalidPurchaseOrderError({ field: "sku", value: line.sku ?? "" });
    if (kind === "service" && !description) return yield* new InvalidPurchaseOrderError({ field: "description", value: "" });
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) return yield* new InvalidPurchaseOrderError({ field: "quantity", value: String(line.quantity) });
    const unit = yield* fromDecimal(line.unitPrice.trim().replace(",", "."), currency, "half-up").pipe(
      Effect.mapError(() => new InvalidPurchaseOrderError({ field: "unitPrice", value: line.unitPrice })));
    if (unit.amountMinor < 0) return yield* new InvalidPurchaseOrderError({ field: "unitPrice", value: line.unitPrice });
    const net = yield* multiply(unit, line.quantity, "half-up").pipe(Effect.mapError(() => new InvalidPurchaseOrderError({ field: "unitPrice", value: line.unitPrice })));
    const warehouseId = line.warehouseId?.trim() || null;
    if (warehouseId && !UUID.test(warehouseId)) return yield* new InvalidPurchaseOrderError({ field: "warehouseId", value: warehouseId });
    return { position, sku: rawSku, description, quantity: line.quantity, unitPriceMinor: unit.amountMinor, netMinor: net.amountMinor, kind, warehouseId };
  });

export const validatePurchaseOrder = (input: PurchaseOrderFields) =>
  Effect.gen(function* () {
    const currency = yield* parseCurrency(input.currency.trim().toUpperCase()).pipe(Effect.mapError(() => new InvalidPurchaseOrderError({ field: "currency", value: input.currency })));
    const expectedDate = input.expectedDate?.trim() || null;
    if (expectedDate !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate) || Number.isNaN(Date.parse(expectedDate)))) {
      return yield* new InvalidPurchaseOrderError({ field: "expectedDate", value: expectedDate });
    }
    if (input.lines.length === 0 || input.lines.length > MAX_LINES) return yield* new InvalidPurchaseOrderError({ field: "lines", value: String(input.lines.length) });
    const lines = yield* Effect.forEach(input.lines, validateLine(currency));
    const total = yield* sum(lines.map((l) => ({ amountMinor: l.netMinor, currency })), currency).pipe(
      Effect.mapError(() => new InvalidPurchaseOrderError({ field: "lines", value: "total" })));
    return { currency, expectedDate, lines: lines as readonly ValidatedLine[], netMinor: total.amountMinor };
  });

/** Libellé d'une commande : numéro, sinon titre. */
export const purchaseOrderLabel = (o: { number: string | null; title: string }) => o.number ?? o.title;
