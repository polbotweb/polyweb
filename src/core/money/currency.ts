/**
 * Devises ISO 4217 (core/money) : nombre de décimales de l'unité mineure.
 * Générique pour tous les modules (boutique, ventes, achats, réservations…).
 */
import { Effect } from 'effect';
import { UnknownCurrencyError } from '@/core/money/errors';

/** Exposant de l'unité mineure par devise (ex. EUR 2 → centimes, JPY 0, KWD 3). */
export const CURRENCY_EXPONENTS = {
  EUR: 2, USD: 2, GBP: 2, CHF: 2, CAD: 2, AUD: 2, NZD: 2, SEK: 2, NOK: 2, DKK: 2, PLN: 2, CZK: 2, HUF: 2, RON: 2,
  BGN: 2, TRY: 2, MAD: 2, DZD: 2, EGP: 2, SAR: 2, AED: 2, QAR: 2, XOF: 0, XAF: 0, MXN: 2, BRL: 2, ARS: 2, CNY: 2,
  INR: 2, SGD: 2, HKD: 2, ZAR: 2, ILS: 2, JPY: 0, KRW: 0, ISK: 0, CLP: 0, VND: 0,
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3, LYD: 3, IQD: 3,
} as const satisfies Record<string, number>;

export type CurrencyCode = keyof typeof CURRENCY_EXPONENTS;

export const isCurrencyCode = (code: string): code is CurrencyCode => Object.hasOwn(CURRENCY_EXPONENTS, code);

/** Exposant de l'unité mineure (ex. 2 pour EUR). */
export const currencyExponent = (currency: CurrencyCode): number => CURRENCY_EXPONENTS[currency];

/** Valide un code devise (insensible à la casse) → `UnknownCurrencyError` sinon. */
export const parseCurrency = (code: string): Effect.Effect<CurrencyCode, UnknownCurrencyError> => {
  const upper = code.trim().toUpperCase();
  return isCurrencyCode(upper) ? Effect.succeed(upper) : Effect.fail(new UnknownCurrencyError({ currency: code }));
};
