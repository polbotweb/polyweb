/** Affichage d'un tarif (montant TTC + périodicité) dans la locale courante. */
import { formatMoney, isCurrencyCode } from "@/core/money";
import type { Locale } from "@i18n/config";
import type { BillingInterval } from "./domain/lifecycle";
import { getSubscriptionsTranslations } from "./i18n";

export const priceLabel = (price: { readonly amountMinor: number; readonly currency: string; readonly interval: BillingInterval; readonly intervalCount: number }, locale: Locale): string => {
  const currency = price.currency.toUpperCase();
  const amount = isCurrencyCode(currency) ? formatMoney({ amountMinor: price.amountMinor, currency }, locale) : `${price.amountMinor} ${currency}`;
  return `${amount} ${getSubscriptionsTranslations(locale).every(price.intervalCount, price.interval)}`;
};

export const dateLabel = (value: Date | null, locale: Locale): string => (value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value) : "—");
