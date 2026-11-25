/**
 * Formatage partagé (serveur et navigateur) des montants en unités mineures : l'exposant vient
 * d'Intl (EUR 2, JPY 0, KWD 3…), jamais d'une division codée en dur par 100.
 */
const LOCALE_TAGS: Record<string, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES", ar: "ar" };

export const exponentOf = (currency: string): number => {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
};

export const formatMinor = (minor: number | null | undefined, currency: string, locale: string): string => {
  if (minor === null || minor === undefined) return "—";
  const digits = exponentOf(currency);
  try {
    return new Intl.NumberFormat(LOCALE_TAGS[locale] ?? locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** digits);
  } catch {
    return `${(minor / 10 ** digits).toFixed(digits)} ${currency}`;
  }
};

/** Valeur décimale pour un champ de saisie (point décimal, sans séparateur de milliers). */
export const minorToInput = (minor: number | null | undefined, currency: string): string =>
  minor === null || minor === undefined ? "" : (minor / 10 ** exponentOf(currency)).toFixed(exponentOf(currency));

/** « 12,34 » / « -12.3 » → unités mineures entières ; `null` si la saisie est invalide. */
export const parseMinor = (value: string, currency: string): number | null => {
  const clean = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  const digits = exponentOf(currency);
  const [whole = "0", fraction = ""] = clean.replace("-", "").split(".");
  if (fraction.length > digits) return null;
  const minor = Number(whole) * 10 ** digits + Number((fraction + "0".repeat(digits)).slice(0, digits) || "0");
  return Number.isSafeInteger(minor) ? (clean.startsWith("-") ? -minor : minor) : null;
};

export const formatDate = (value: string | Date | null | undefined, locale: string): string => {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(LOCALE_TAGS[locale] ?? locale, { dateStyle: "medium", timeZone: value instanceof Date || (typeof value === "string" && value.length > 10) ? undefined : "UTC" }).format(date);
};
