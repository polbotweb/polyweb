/** Mise en forme des créneaux (pure). */
import type { Locale } from "@i18n/config";
import { formatZoned } from "@/core/scheduling";
import { currencyExponent, isCurrencyCode } from "@/core/money";

/** Créneau lisible, dans le fuseau de la ressource : « lundi 11 janvier 2027 à 09:00 – 10:00 ». */
export const formatSlot = (start: Date, end: Date, zone: string, locale: Locale) =>
  `${formatZoned(start, zone, locale, { dateStyle: "full", timeStyle: "short" })} – ${formatZoned(end, zone, locale, { timeStyle: "short" })}`;

/** Montant en unités mineures ISO 4217 (core/money), au format de la locale. */
export const formatMinor = (amountMinor: number, currency: string, locale: Locale) => {
  const code = isCurrencyCode(currency) ? currency : "EUR";
  const exponent = currencyExponent(code);
  return new Intl.NumberFormat(locale, { style: "currency", currency: code, minimumFractionDigits: exponent, maximumFractionDigits: exponent }).format(amountMinor / 10 ** exponent);
};

/** Échéance lisible (date et heure) dans le fuseau de la ressource. */
export const formatDue = (at: Date, zone: string, locale: Locale) => formatZoned(at, zone, locale, { dateStyle: "long", timeStyle: "short" });
