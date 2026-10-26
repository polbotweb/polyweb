/**
 * Calcul de taxes générique (TVA/GST/sales tax) sur des montants core/money.
 * Les taux sont des pourcentages décimaux exacts (« 20 », « 5.5 », « 8.1 »).
 * Stratégie d'arrondi d'un document :
 * - `per-rate` (défaut, factures FR/UE) : bases cumulées par taux, taxe arrondie une fois par taux ;
 * - `per-line` : taxe arrondie à chaque ligne puis sommée (tickets, certains ERP).
 * Le module Tax fournira les taux par pays/catégorie/type de client ; ce fichier reste neutre.
 */
import { Effect } from 'effect';
import type { CurrencyCode } from '@/core/money/currency';
import type { CurrencyMismatchError, InvalidAmountError } from '@/core/money/errors';
import { add, parseDecimal, percentage, subtract, sum, zero, type Money } from '@/core/money/money';
import { divideRounded, type RoundingMode } from '@/core/money/rounding';

export type TaxRoundingStrategy = 'per-rate' | 'per-line';

export interface TaxLine {
  /** Base hors taxe de la ligne (déjà remisée). */
  readonly net: Money;
  /** Taux en pourcentage décimal ; « 0 » pour exonération / autoliquidation. */
  readonly ratePercent: string;
}

export interface TaxBreakdown {
  readonly ratePercent: string;
  readonly base: Money;
  readonly tax: Money;
}

export interface TaxTotals {
  readonly net: Money;
  readonly tax: Money;
  readonly gross: Money;
  readonly byRate: readonly TaxBreakdown[];
}

/** Taxe due sur une base HT. */
export const taxFromNet = (net: Money, ratePercent: string, mode: RoundingMode = 'half-up') => percentage(net, ratePercent, mode);

/** Montant TTC depuis le HT (HT + taxe arrondie). */
export const grossFromNet = (net: Money, ratePercent: string, mode: RoundingMode = 'half-up'): Effect.Effect<Money, InvalidAmountError | CurrencyMismatchError> =>
  Effect.flatMap(taxFromNet(net, ratePercent, mode), (tax) => add(net, tax));

/** Ventile un TTC en HT + taxe (HT = TTC × 100 / (100 + taux), taxe = TTC − HT : la somme est exacte). */
export const splitGross = (gross: Money, ratePercent: string, mode: RoundingMode = 'half-up'): Effect.Effect<{ readonly net: Money; readonly tax: Money }, InvalidAmountError | CurrencyMismatchError> =>
  Effect.gen(function* () {
    const { numerator, denominator } = yield* parseDecimal(ratePercent);
    const net: Money = { amountMinor: Number(divideRounded(BigInt(gross.amountMinor) * 100n * denominator, 100n * denominator + numerator, mode)), currency: gross.currency };
    const tax = yield* subtract(gross, net);
    return { net, tax };
  });

const canonicalRate = (rate: string) => rate.trim().replace(',', '.').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

/** Totaux d'un document (devis, facture, avoir, commande) avec ventilation par taux. */
export const computeTaxTotals = (
  lines: readonly TaxLine[],
  options: { readonly currency: CurrencyCode; readonly mode?: RoundingMode; readonly strategy?: TaxRoundingStrategy },
): Effect.Effect<TaxTotals, InvalidAmountError | CurrencyMismatchError> =>
  Effect.gen(function* () {
    const mode = options.mode ?? 'half-up';
    const strategy = options.strategy ?? 'per-rate';
    const groups = new Map<string, { base: Money; tax: Money }>();
    for (const line of lines) {
      const rate = canonicalRate(line.ratePercent);
      const group = groups.get(rate) ?? { base: zero(options.currency), tax: zero(options.currency) };
      const base = yield* add(group.base, line.net);
      const tax = strategy === 'per-line' ? yield* add(group.tax, yield* taxFromNet(line.net, rate, mode)) : group.tax;
      groups.set(rate, { base, tax });
    }
    const byRate: TaxBreakdown[] = [];
    for (const [ratePercent, group] of groups) {
      const tax = strategy === 'per-rate' ? yield* taxFromNet(group.base, ratePercent, mode) : group.tax;
      byRate.push({ ratePercent, base: group.base, tax });
    }
    byRate.sort((a, b) => Number(a.ratePercent) - Number(b.ratePercent));
    const net = yield* sum(byRate.map((r) => r.base), options.currency);
    const tax = yield* sum(byRate.map((r) => r.tax), options.currency);
    const gross = yield* add(net, tax);
    return { net, tax, gross, byRate };
  });
