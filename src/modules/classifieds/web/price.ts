import type { ClassifiedsTranslations } from "../i18n";
import type { ClassifiedPriceKind } from "../domain/workflow";

export const formatClassifiedPrice = (
  priceKind: ClassifiedPriceKind,
  priceMinor: number | null,
  currency: string | null,
  locale: string,
  t: ClassifiedsTranslations,
): string => {
  if (priceKind === "free") return t.free;
  if (priceKind === "on_request" || priceMinor == null || !currency) return t.onRequest;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(priceMinor / 100);
  } catch {
    return `${(priceMinor / 100).toFixed(2)} ${currency}`;
  }
};
