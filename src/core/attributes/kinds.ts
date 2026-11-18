/** Types d'attributs dynamiques (core/attributes) et helpers purs, sans I/O. */
import { LOCALES, type Locale } from "@i18n/config";

export const ATTRIBUTE_KINDS = ["text", "number", "integer", "boolean", "select", "multiselect", "date"] as const;
export type AttributeKind = (typeof ATTRIBUTE_KINDS)[number];

export const ATTRIBUTE_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
export const OPTION_KEY_RE = /^[a-z0-9][a-z0-9_]{0,63}$/;

export type LocaleMap = Record<Locale, string>;

export const emptyLocaleMap = (): LocaleMap => ({ fr: "", en: "", es: "", ar: "" });

export function isAttributeKind(value: string): value is AttributeKind {
  return (ATTRIBUTE_KINDS as readonly string[]).includes(value);
}

export function completeLocales(input: Partial<Record<string, string>> | undefined, fallback = ""): LocaleMap {
  const out = emptyLocaleMap();
  for (const locale of LOCALES) {
    const value = input?.[locale]?.trim();
    out[locale] = value && value.length > 0 ? value.slice(0, 120) : fallback;
  }
  if (!out.fr) out.fr = fallback;
  for (const locale of LOCALES) {
    if (!out[locale]) out[locale] = out.fr || fallback;
  }
  return out;
}

export function hasAllLocaleLabels(input: Partial<Record<string, string>> | undefined): boolean {
  return LOCALES.every((locale) => (input?.[locale] ?? "").trim().length > 0);
}
