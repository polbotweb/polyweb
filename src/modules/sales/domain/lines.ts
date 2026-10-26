/**
 * Lignes et totaux d'un document de vente (purs, core/money, sans flottants).
 * Net de ligne = arrondi(PU × quantité) − arrondi(remise %) ; taxes via le module tax
 * (`computeDocumentTax` : régime UE, taux par pays/date, ventilation par taux).
 */
import { Effect } from "effect";
import { multiply, percentage, subtract, type CurrencyCode, type Money } from "@/core/money";
import { computeDocumentTax, type TaxRateEntry } from "@/modules/tax/domain/rates";
import { TAX_CATEGORIES, type TaxCategory, type TaxContext } from "@/modules/tax/domain/rules";
import { EmptySalesDocumentError, InvalidSalesLineError } from "./errors";
import type { SalesDocumentKind } from "./workflow";

export interface SalesLineInput {
  readonly description: string;
  /** Quantité décimale strictement positive (« 1 », « 2.5 »). */
  readonly quantity: string;
  /** Prix unitaire HT en unités mineures. */
  readonly unitPriceMinor: number;
  /** Remise en pourcentage décimal (« 0 » à « 100 »). */
  readonly discountPercent?: string;
  readonly taxCategory: TaxCategory;
}

export interface SalesLineComputed extends SalesLineInput {
  readonly net: Money;
}

const POSITIVE_DECIMAL = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,4})?$/;

const validateLine = (line: SalesLineInput, index: number): Effect.Effect<SalesLineInput, InvalidSalesLineError> => {
  if (!line.description.trim()) return Effect.fail(new InvalidSalesLineError({ index, field: "description", value: line.description }));
  if (!POSITIVE_DECIMAL.test(line.quantity) || Number(line.quantity) <= 0) return Effect.fail(new InvalidSalesLineError({ index, field: "quantity", value: line.quantity }));
  if (!Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) return Effect.fail(new InvalidSalesLineError({ index, field: "unitPrice", value: String(line.unitPriceMinor) }));
  const discount = line.discountPercent ?? "0";
  if (!POSITIVE_DECIMAL.test(discount) || Number(discount) > 100) return Effect.fail(new InvalidSalesLineError({ index, field: "discountPercent", value: discount }));
  if (!(TAX_CATEGORIES as readonly string[]).includes(line.taxCategory)) return Effect.fail(new InvalidSalesLineError({ index, field: "taxCategory", value: line.taxCategory }));
  return Effect.succeed(line);
};

/** Net HT d'une ligne (arrondi half-up au centime à chaque étape). */
export const computeLineNet = (line: SalesLineInput, currency: CurrencyCode, index = 0) =>
  Effect.gen(function* () {
    yield* validateLine(line, index);
    const gross = yield* multiply({ amountMinor: line.unitPriceMinor, currency }, line.quantity, "half-up");
    const discount = yield* percentage(gross, line.discountPercent ?? "0", "half-up");
    return yield* subtract(gross, discount);
  });

export interface SalesDocumentTotalsInput {
  readonly kind: SalesDocumentKind;
  readonly currency: CurrencyCode;
  /** Date du fait générateur (AAAA-MM-JJ) : sélection des taux en vigueur. */
  readonly date: string;
  readonly context: TaxContext;
  readonly lines: readonly SalesLineInput[];
  readonly rates?: readonly TaxRateEntry[];
}

/** Lignes calculées + totaux (HT, TVA, TTC, ventilation) + régime/mention légale. */
export const computeSalesTotals = (input: SalesDocumentTotalsInput) =>
  Effect.gen(function* () {
    if (input.lines.length === 0) return yield* Effect.fail(new EmptySalesDocumentError({ kind: input.kind }));
    const lines: SalesLineComputed[] = [];
    for (const [index, line] of input.lines.entries()) {
      lines.push({ ...line, net: yield* computeLineNet(line, input.currency, index) });
    }
    const tax = yield* computeDocumentTax(lines.map((line) => ({ net: line.net, category: line.taxCategory })), {
      context: input.context,
      currency: input.currency,
      date: input.date,
      rates: input.rates,
    });
    return { lines, totals: tax.totals, determination: tax.determination, taxLines: tax.lines };
  });
