/** Mise en forme (pure) des montants et pays du tunnel public. */
import type { Locale } from "@i18n/config";
import { formatMoney, isCurrencyCode } from "@/core/money";

/** Montant en unités mineures ISO 4217 (core/money), au format de la locale. */
export const formatMinor = (amountMinor: number, currency: string, locale: Locale) => {
  const code = currency.toUpperCase();
  return isCurrencyCode(code) ? formatMoney({ amountMinor, currency: code }, locale) : `${amountMinor} ${currency}`;
};

/** Nom localisé d'un pays (ISO 3166-1 alpha-2), repli sur le code. */
export const countryName = (code: string, locale: Locale) => {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

export const formatDateTime = (date: Date, locale: Locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
