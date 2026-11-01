/**
 * Contre-valeur figée d'un document (core/fx) : HT et TVA convertis séparément au taux exact
 * (arrondi au plus proche, demi vers le haut), TTC = HT + TVA pour garantir l'égalité comptable.
 */
import { Effect } from 'effect';
import type { CurrencyCode, InvalidAmountError } from '@/core/money';
import { convertAt, rateToDecimal, type Rate } from '@/core/fx/rate';

export interface FrozenAmounts {
  readonly baseCurrency: CurrencyCode;
  /** Décimal indicatif (12 chiffres) : les montants figés proviennent du taux exact. */
  readonly exchangeRate: string;
  readonly exchangeRateDate: string;
  readonly netBaseMinor: number;
  readonly taxBaseMinor: number;
  readonly grossBaseMinor: number;
}

export const freezeAmounts = (
  amounts: { readonly netMinor: number; readonly taxMinor: number; readonly currency: CurrencyCode },
  baseCurrency: CurrencyCode,
  rate: Rate,
  rateDate: string,
): Effect.Effect<FrozenAmounts, InvalidAmountError> =>
  Effect.gen(function* () {
    const net = yield* convertAt({ amountMinor: amounts.netMinor, currency: amounts.currency }, baseCurrency, rate, 'half-up');
    const tax = yield* convertAt({ amountMinor: amounts.taxMinor, currency: amounts.currency }, baseCurrency, rate, 'half-up');
    return { baseCurrency, exchangeRate: rateToDecimal(rate, 12), exchangeRateDate: rateDate, netBaseMinor: net.amountMinor, taxBaseMinor: tax.amountMinor, grossBaseMinor: net.amountMinor + tax.amountMinor };
  });
