/** Libellés back-office banking et comptabilité (4 locales ; clés de référence : `fr`). */
import type { Locale } from "@i18n/config";
import { ar } from "./ar";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";

type Deep<T> = { readonly [K in keyof T]: T[K] extends string ? string : Deep<T[K]> };
export type BankingTranslations = Deep<typeof fr>;

const translations: Record<Locale, BankingTranslations> = { fr, en, es, ar };

export function getBankingTranslations(locale: Locale): BankingTranslations {
  return translations[locale] ?? translations.fr;
}

/** Remplace `{clé}` par les valeurs fournies. */
export const fill = (template: string, values: Readonly<Record<string, string | number>>): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
