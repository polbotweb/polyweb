/**
 * Taux de change exacts (core/fx) : fractions BigInt `numerator / denominator` (> 0), sans flottants.
 * Un taux `r` de `from` vers `to` signifie 1 `from` = r `to`. Les taux croisés (USD→GBP via EUR)
 * restent des fractions exactes ; l'arrondi n'a lieu qu'une fois, sur le montant converti.
 */
import { Effect } from 'effect';
import { currencyExponent, divideRounded, parseDecimal, type CurrencyCode, type Money, type RoundingMode, InvalidAmountError } from '@/core/money';
import { InvalidRateError } from '@/core/fx/errors';

export interface Rate { readonly numerator: bigint; readonly denominator: bigint }

const abs = (n: bigint) => (n < 0n ? -n : n);
const gcd = (a: bigint, b: bigint): bigint => { let x = abs(a); let y = abs(b); while (y !== 0n) { [x, y] = [y, x % y]; } return x; };

/** Fraction réduite (dénominateur positif). */
export const reduce = (numerator: bigint, denominator: bigint): Rate => {
  const g = gcd(numerator, denominator) || 1n;
  const sign = denominator < 0n ? -1n : 1n;
  return { numerator: (numerator / g) * sign, denominator: (denominator / g) * sign };
};

/** Taux depuis une chaîne décimale (« 1.0834 ») ; refuse zéro et négatifs. */
export const parseRate = (input: string): Effect.Effect<Rate, InvalidRateError> =>
  parseDecimal(input).pipe(
    Effect.mapError(() => new InvalidRateError({ input })),
    Effect.flatMap(({ numerator, denominator }) => (numerator > 0n ? Effect.succeed(reduce(numerator, denominator)) : Effect.fail(new InvalidRateError({ input })))),
  );

export const ONE: Rate = { numerator: 1n, denominator: 1n };
export const invert = (rate: Rate): Rate => reduce(rate.denominator, rate.numerator);
export const multiplyRates = (a: Rate, b: Rate): Rate => reduce(a.numerator * b.numerator, a.denominator * b.denominator);
export const rateEquals = (a: Rate, b: Rate) => a.numerator * b.denominator === b.numerator * a.denominator;

/**
 * Taux croisé `from → to` à partir de taux exprimés depuis une même base (BCE : 1 EUR = x devise).
 * `quotes` ne contient pas la base elle-même (taux 1 implicite).
 */
export const crossRate = (base: CurrencyCode, quotes: ReadonlyMap<string, Rate>, from: CurrencyCode, to: CurrencyCode): Rate | undefined => {
  const q = (c: CurrencyCode) => (c === base ? ONE : quotes.get(c));
  const f = q(from); const t = q(to);
  return f && t ? multiplyRates(invert(f), t) : undefined;
};

/** Représentation décimale tronquée à `scale` chiffres (affichage, stockage indicatif). */
export const rateToDecimal = (rate: Rate, scale = 10): string => {
  const scaled = divideRounded(rate.numerator * 10n ** BigInt(scale), rate.denominator, 'half-even');
  const digits = scaled.toString().padStart(scale + 1, '0');
  const int = digits.slice(0, -scale) || '0';
  const frac = digits.slice(-scale).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
};

/** Conversion exacte d'un montant au taux fractionnaire, un seul arrondi (`mode`). */
export const convertAt = (value: Money, to: CurrencyCode, rate: Rate, mode: RoundingMode): Effect.Effect<Money, InvalidAmountError> => {
  const shift = currencyExponent(to) - currencyExponent(value.currency);
  const num = BigInt(value.amountMinor) * rate.numerator * (shift > 0 ? 10n ** BigInt(shift) : 1n);
  const den = rate.denominator * (shift < 0 ? 10n ** BigInt(-shift) : 1n);
  const result = divideRounded(num, den, mode);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) && result >= BigInt(Number.MIN_SAFE_INTEGER)
    ? Effect.succeed({ amountMinor: Number(result), currency: to })
    : Effect.fail(new InvalidAmountError({ input: result.toString(), reason: 'overflow' }));
};
