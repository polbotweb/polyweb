/** Mise en forme des créneaux (pure). */
import type { Locale } from "@i18n/config";
import { formatZoned } from "@/core/scheduling";
import { formatMoney, isCurrencyCode } from "@/core/money";

/** Créneau lisible, dans le fuseau de la ressource : « lundi 11 janvier 2027 à 09:00 – 10:00 ». */
export const formatSlot = (start: Date, end: Date, zone: string, locale: Locale) =>
  `${formatZoned(start, zone, locale, { dateStyle: "full", timeStyle: "short" })} – ${formatZoned(end, zone, locale, { timeStyle: "short" })}`;

/** Montant en unités mineures ISO 4217 (core/money), au format de la locale. */
export const formatMinor = (amountMinor: number, currency: string, locale: Locale) => {
  const code = currency.toUpperCase();
  return isCurrencyCode(code) ? formatMoney({ amountMinor, currency: code }, locale) : `${amountMinor} ${currency}`;
};

/** Échéance lisible (date et heure) dans le fuseau de la ressource. */
export const formatDue = (at: Date, zone: string, locale: Locale) => formatZoned(at, zone, locale, { dateStyle: "long", timeStyle: "short" });
