/**
 * Prix et TVA du tunnel de vente. Les prix catalogue (`product_variants.priceMinor`) et les frais
 * de port sont des prix publics TTC au taux du pays du vendeur (affichage obligatoire TTC en B2C).
 *
 * Calcul (unités mineures, aucun flottant) :
 * 1. TTC cumulé par catégorie de TVA, ventilé une seule fois en HT + TVA au taux vendeur
 *    (`splitGross`) : le total TTC est exactement la somme des prix affichés ;
 * 2. régime déterminé par le module Tax (`determineTax`, B2C) selon le pays de livraison :
 *    - TVA due dans le pays du vendeur (national, vente à distance sous le seuil OSS) → TTC inchangé ;
 *    - exportation hors UE → TVA non facturée, le client paie le HT ;
 *    - vente à distance OSS → HT recalculé au taux du pays de destination (`computeDocumentTax`).
 */
import { Effect } from "effect";
import { splitGross, sum, type CurrencyCode, type Money, type TaxBreakdown } from "@/core/money";
import { computeDocumentTax, DEFAULT_TAX_RATES, resolveTaxRate, type TaxRateEntry } from "@/modules/tax/domain/rates";
import type { TaxCategory, TaxTreatment } from "@/modules/tax/domain/rules";
import { InvalidCartError } from "./errors";

export const MAX_LINE_QUANTITY = 99;
export const MAX_CART_LINES = 50;

export interface PricedLine {
  readonly key: string;
  readonly unitGrossMinor: number;
  readonly quantity: number;
  readonly category: TaxCategory;
}

export interface OrderPricing {
  readonly currency: CurrencyCode;
  readonly treatment: TaxTreatment;
  readonly taxCountry: string | null;
  readonly net: Money;
  readonly tax: Money;
  readonly gross: Money;
  readonly byRate: readonly TaxBreakdown[];
  /** Total TTC catalogue (avant ajustement du régime) : base d'affichage du panier. */
  readonly catalogGross: Money;
}

export const validateQuantity = (quantity: number) =>
  Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_LINE_QUANTITY
    ? Effect.succeed(quantity)
    : Effect.fail(new InvalidCartError({ field: "quantity", value: String(quantity) }));

export const lineGrossMinor = (line: Pick<PricedLine, "unitGrossMinor" | "quantity">) => line.unitGrossMinor * line.quantity;

export const priceOrder = (
  lines: readonly PricedLine[],
  options: {
    readonly currency: CurrencyCode;
    readonly sellerCountry: string;
    readonly buyerCountry: string;
    readonly ossRegistered: boolean;
    readonly date: string;
    readonly rates?: readonly TaxRateEntry[];
  },
) =>
  Effect.gen(function* () {
    if (lines.length === 0 || lines.length > MAX_CART_LINES) return yield* Effect.fail(new InvalidCartError({ field: "lines", value: String(lines.length) }));
    for (const line of lines) {
      yield* validateQuantity(line.quantity);
      if (!Number.isSafeInteger(line.unitGrossMinor) || line.unitGrossMinor < 0) return yield* Effect.fail(new InvalidCartError({ field: "variant", value: line.key }));
    }
    const table = [...(options.rates ?? []), ...DEFAULT_TAX_RATES];
    const byCategory = new Map<TaxCategory, number>();
    for (const line of lines) byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + lineGrossMinor(line));
    const nets: { net: Money; category: TaxCategory; tax: Money; ratePercent: string }[] = [];
    for (const [category, grossMinor] of byCategory) {
      const ratePercent = yield* resolveTaxRate(table, { countryCode: options.sellerCountry, category, date: options.date, customerType: "B2C" });
      const split = yield* splitGross({ amountMinor: grossMinor, currency: options.currency }, ratePercent);
      nets.push({ ...split, category, ratePercent });
    }
    const catalogGross = yield* sum([...byCategory.values()].map((amountMinor) => ({ amountMinor, currency: options.currency })), options.currency);
    const computed = yield* computeDocumentTax(nets.map(({ net, category }) => ({ net, category })), {
      context: { sellerCountry: options.sellerCountry, buyerCountry: options.buyerCountry, customerType: "B2C", supplyType: "goods", ossRegistered: options.ossRegistered },
      currency: options.currency,
      date: options.date,
      rates: options.rates,
    });
    const { determination } = computed;
    const seller = options.sellerCountry.toUpperCase();
    if (determination.charged && determination.taxCountry === seller) {
      // TVA du pays vendeur : on conserve la ventilation exacte du TTC catalogue.
      const net = yield* sum(nets.map((n) => n.net), options.currency);
      const tax = yield* sum(nets.map((n) => n.tax), options.currency);
      const byRate = new Map<string, TaxBreakdown>();
      for (const n of nets) {
        const prev = byRate.get(n.ratePercent);
        byRate.set(n.ratePercent, prev
          ? { ratePercent: n.ratePercent, base: { amountMinor: prev.base.amountMinor + n.net.amountMinor, currency: options.currency }, tax: { amountMinor: prev.tax.amountMinor + n.tax.amountMinor, currency: options.currency } }
          : { ratePercent: n.ratePercent, base: n.net, tax: n.tax });
      }
      return { currency: options.currency, treatment: determination.treatment, taxCountry: determination.taxCountry, net, tax, gross: catalogGross, byRate: [...byRate.values()].sort((a, b) => Number(a.ratePercent) - Number(b.ratePercent)), catalogGross } satisfies OrderPricing;
    }
    return { currency: options.currency, treatment: determination.treatment, taxCountry: determination.taxCountry, ...computed.totals, catalogGross } satisfies OrderPricing;
  });
