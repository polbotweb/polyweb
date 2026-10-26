/**
 * Montants monétaires génériques (core/money) : entiers en unités mineures + devise ISO 4217.
 * Toute l'arithmétique passe par BigInt (exacte), le résultat est borné à `Number.MAX_SAFE_INTEGER`
 * pour rester compatible avec les colonnes `integer`/`bigint` (mode number) de Drizzle.
 * Les opérations faillibles renvoient un `Effect` typé (devises incompatibles, dépassement…).
 */
import { Effect, Schema } from 'effect';
import { CURRENCY_EXPONENTS, currencyExponent, type CurrencyCode } from '@/core/money/currency';
import { CurrencyMismatchError, InvalidAmountError } from '@/core/money/errors';
import { divideRounded, type RoundingMode } from '@/core/money/rounding';

export interface Money {
  /** Montant en unités mineures (ex. centimes), entier sûr, signé. */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

/** Schéma Effect d'un montant (sérialisation JSON / formulaires / colonnes). */
export const MoneySchema = Schema.Struct({
  amountMinor: Schema.Int,
  currency: Schema.Literals(Object.keys(CURRENCY_EXPONENTS) as [CurrencyCode, ...CurrencyCode[]]),
});

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

const fromBig = (value: bigint, currency: CurrencyCode, input: string): Effect.Effect<Money, InvalidAmountError> =>
  value > MAX || value < -MAX ? Effect.fail(new InvalidAmountError({ input, reason: 'overflow' })) : Effect.succeed({ amountMinor: Number(value), currency });

/** Construit un montant à partir d'unités mineures (entier sûr exigé). */
export const money = (amountMinor: number, currency: CurrencyCode): Effect.Effect<Money, InvalidAmountError> =>
  Number.isSafeInteger(amountMinor) ? Effect.succeed({ amountMinor, currency }) : Effect.fail(new InvalidAmountError({ input: String(amountMinor), reason: 'overflow' }));

export const zero = (currency: CurrencyCode): Money => ({ amountMinor: 0, currency });

const DECIMAL = /^([+-])?(\d+)(?:[.,](\d+))?$/;

/** Fraction exacte `numerator / denominator` issue d'une chaîne décimale (« 20 », « 5.5 », « -0,125 »). */
export const parseDecimal = (input: string): Effect.Effect<{ readonly numerator: bigint; readonly denominator: bigint }, InvalidAmountError> => {
  const match = DECIMAL.exec(input.trim());
  if (!match) return Effect.fail(new InvalidAmountError({ input, reason: 'format' }));
  const [, sign, int, frac = ''] = match;
  const numerator = BigInt(`${int}${frac}`) * (sign === '-' ? -1n : 1n);
  return Effect.succeed({ numerator, denominator: 10n ** BigInt(frac.length) });
};

/**
 * Montant depuis une saisie décimale (« 12.34 » EUR → 1234).
 * Sans `mode`, une précision supérieure à la devise est refusée (`precision`) ; avec `mode`, elle est arrondie.
 */
export const fromDecimal = (input: string, currency: CurrencyCode, mode?: RoundingMode): Effect.Effect<Money, InvalidAmountError> =>
  Effect.flatMap(parseDecimal(input), ({ numerator, denominator }) => {
    const scaled = numerator * 10n ** BigInt(currencyExponent(currency));
    if (!mode && scaled % denominator !== 0n) return Effect.fail(new InvalidAmountError({ input, reason: 'precision' }));
    return fromBig(divideRounded(scaled, denominator, mode ?? 'down'), currency, input);
  });

/** Représentation décimale canonique (« 1234 » EUR → « 12.34 », « -5 » → « -0.05 »). */
export const toDecimalString = (value: Money): string => {
  const exponent = currencyExponent(value.currency);
  const digits = Math.abs(value.amountMinor).toString().padStart(exponent + 1, '0');
  const sign = value.amountMinor < 0 ? '-' : '';
  return exponent === 0 ? `${sign}${digits}` : `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
};

const sameCurrency = (left: Money, right: Money): Effect.Effect<CurrencyCode, CurrencyMismatchError> =>
  left.currency === right.currency ? Effect.succeed(left.currency) : Effect.fail(new CurrencyMismatchError({ left: left.currency, right: right.currency }));

export const add = (left: Money, right: Money): Effect.Effect<Money, CurrencyMismatchError | InvalidAmountError> =>
  Effect.flatMap(sameCurrency(left, right), (currency) => fromBig(BigInt(left.amountMinor) + BigInt(right.amountMinor), currency, 'add'));

export const subtract = (left: Money, right: Money): Effect.Effect<Money, CurrencyMismatchError | InvalidAmountError> =>
  Effect.flatMap(sameCurrency(left, right), (currency) => fromBig(BigInt(left.amountMinor) - BigInt(right.amountMinor), currency, 'subtract'));

/** Somme d'une liste (liste vide → zéro dans `currency`). */
export const sum = (values: readonly Money[], currency: CurrencyCode): Effect.Effect<Money, CurrencyMismatchError | InvalidAmountError> =>
  Effect.reduce(values, () => zero(currency), (acc, value) => add(acc, value));

export const negate = (value: Money): Money => ({ amountMinor: value.amountMinor === 0 ? 0 : -value.amountMinor, currency: value.currency });

export const isZero = (value: Money) => value.amountMinor === 0;
export const isNegative = (value: Money) => value.amountMinor < 0;

/** -1 / 0 / 1 (même devise exigée). */
export const compare = (left: Money, right: Money): Effect.Effect<-1 | 0 | 1, CurrencyMismatchError> =>
  Effect.map(sameCurrency(left, right), () => (left.amountMinor < right.amountMinor ? -1 : left.amountMinor > right.amountMinor ? 1 : 0));

/** Multiplie par un facteur décimal exact (« 3 », « 0.15 », « 1.0825 ») puis arrondit à l'unité mineure. */
export const multiply = (value: Money, factor: string | number, mode: RoundingMode): Effect.Effect<Money, InvalidAmountError> =>
  Effect.flatMap(parseDecimal(String(factor)), ({ numerator, denominator }) =>
    fromBig(divideRounded(BigInt(value.amountMinor) * numerator, denominator, mode), value.currency, String(factor)),
  );

/** Pourcentage d'un montant (« 20 » → 20 %, « 5.5 » → 5,5 %), arrondi à l'unité mineure. */
export const percentage = (value: Money, ratePercent: string | number, mode: RoundingMode): Effect.Effect<Money, InvalidAmountError> =>
  Effect.flatMap(parseDecimal(String(ratePercent)), ({ numerator, denominator }) =>
    fromBig(divideRounded(BigInt(value.amountMinor) * numerator, denominator * 100n, mode), value.currency, String(ratePercent)),
  );

/** Conversion de devise à un taux décimal exact (1 `from` = `rate` `to`), en tenant compte des exposants. */
export const convert = (value: Money, to: CurrencyCode, rate: string, mode: RoundingMode): Effect.Effect<Money, InvalidAmountError> =>
  Effect.flatMap(parseDecimal(rate), ({ numerator, denominator }) => {
    const shift = currencyExponent(to) - currencyExponent(value.currency);
    const num = BigInt(value.amountMinor) * numerator * (shift > 0 ? 10n ** BigInt(shift) : 1n);
    const den = denominator * (shift < 0 ? 10n ** BigInt(-shift) : 1n);
    return fromBig(divideRounded(num, den, mode), to, rate);
  });

/**
 * Répartit un montant selon des poids entiers positifs (méthode du plus fort reste) :
 * la somme des parts vaut exactement le total (échéanciers, acomptes, ventilation de remise).
 */
export const allocate = (value: Money, ratios: readonly number[]): Effect.Effect<readonly Money[], InvalidAmountError> => {
  if (ratios.length === 0 || ratios.some((r) => !Number.isSafeInteger(r) || r < 0) || ratios.every((r) => r === 0)) {
    return Effect.fail(new InvalidAmountError({ input: ratios.join(':'), reason: 'ratios' }));
  }
  const total = BigInt(value.amountMinor);
  const sign = total < 0n ? -1n : 1n;
  const absolute = total * sign;
  const weights = ratios.map(BigInt);
  const weightSum = weights.reduce((a, b) => a + b, 0n);
  const shares = weights.map((w) => (absolute * w) / weightSum);
  let remaining = absolute - shares.reduce((a, b) => a + b, 0n);
  const order = weights
    .map((w, index) => ({ index, remainder: (absolute * w) % weightSum }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const { index } of order) {
    if (remaining === 0n) break;
    if (weights[index] === 0n) continue;
    shares[index] += 1n;
    remaining -= 1n;
  }
  return Effect.succeed(shares.map((share) => ({ amountMinor: Number(share * sign) || 0, currency: value.currency })));
};

/** Affichage localisé (Intl), ex. `formatMoney({1234, EUR}, 'fr')` → « 12,34 € ». */
export const formatMoney = (value: Money, locale: string, options: Intl.NumberFormatOptions = {}): string => {
  const exponent = currencyExponent(value.currency);
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: value.currency, minimumFractionDigits: exponent, maximumFractionDigits: exponent, ...options });
  return formatter.format(Number(toDecimalString(value)));
};
