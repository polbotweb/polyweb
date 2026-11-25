/**
 * Conversions sûres partagées par les lecteurs : montant décimal → unités mineures exactes (sans
 * flottant), dates bancaires → ISO, nettoyage de texte. Toute valeur douteuse est refusée.
 */
import { currencyExponent, isCurrencyCode } from "@/core/money";

/** Exposant ISO 4217 de la devise, ou `null` si inconnue. */
export const exponentOf = (currency: string): number | null => {
  const code = currency.trim().toUpperCase();
  return isCurrencyCode(code) ? currencyExponent(code) : null;
};

/**
 * Décimal canonique (`-1234.5`) → unités mineures exactes. `null` si invalide ou si la précision
 * dépasse l'exposant de la devise (pas d'arrondi silencieux). Borné à Number.MAX_SAFE_INTEGER.
 */
export const decimalToMinor = (canonical: string, exponent: number): number | null => {
  const match = /^([+-]?)(\d{1,16})(?:\.(\d{1,12}))?$/.exec(canonical.trim());
  if (!match) return null;
  const [, sign, int, frac = ""] = match;
  const significant = frac.replace(/0+$/, "");
  if (significant.length > exponent) return null;
  const digits = BigInt(int! + frac.padEnd(exponent, "0").slice(0, exponent));
  if (digits > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const value = Number(digits);
  return sign === "-" && value !== 0 ? -value : value;
};

/**
 * Montant saisi avec séparateurs (`1 234,56`, `1.234,56`, `1,234.56`, `-12`, `12-`) → canonique.
 * `decimal` = séparateur décimal attendu ; les séparateurs de milliers (espace, insécable, point
 * ou virgule opposés, apostrophe) sont retirés. `null` si ambigu.
 */
export const canonicalAmount = (raw: string, decimal: "," | "."): string | null => {
  let value = raw.replace(/[\s\u00a0\u202f']/g, "").replace(/[€$£]|EUR|USD|GBP|CHF/gi, "");
  if (!value) return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) { negative = true; value = value.slice(1, -1); }
  if (value.endsWith("-")) { negative = !negative; value = value.slice(0, -1); }
  if (value.startsWith("-")) { negative = !negative; value = value.slice(1); }
  else if (value.startsWith("+")) value = value.slice(1);
  const thousands = decimal === "," ? "." : ",";
  const lastDecimal = value.lastIndexOf(decimal);
  const intPart = (lastDecimal >= 0 ? value.slice(0, lastDecimal) : value).split(thousands).join("");
  const fracPart = lastDecimal >= 0 ? value.slice(lastDecimal + 1) : "";
  if (!/^\d+$/.test(intPart) || (lastDecimal >= 0 && !/^\d+$/.test(fracPart))) return null;
  return `${negative ? "-" : ""}${intPart}${fracPart ? `.${fracPart}` : ""}`;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Date ISO validée (rejette 2024-02-30). */
export const isoDate = (year: number, month: number, day: number): string | null => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1970 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** Année sur 2 chiffres : fenêtre glissante (≤ année courante + 20 → 20xx). */
export const fullYear = (yy: number, now: Date = new Date()): number => {
  const century = Math.floor(now.getUTCFullYear() / 100) * 100;
  const candidate = century + yy;
  return candidate > now.getUTCFullYear() + 20 ? candidate - 100 : candidate;
};

/** `AAMMJJ` (SWIFT). */
export const yymmdd = (raw: string): string | null => {
  if (!/^\d{6}$/.test(raw)) return null;
  return isoDate(fullYear(Number(raw.slice(0, 2))), Number(raw.slice(2, 4)), Number(raw.slice(4, 6)));
};

/** `JJMMAA` (CFONB). */
export const ddmmyy = (raw: string): string | null => {
  if (!/^\d{6}$/.test(raw)) return null;
  return isoDate(fullYear(Number(raw.slice(4, 6))), Number(raw.slice(2, 4)), Number(raw.slice(0, 2)));
};

/** Date ou date-heure ISO 8601 (`2024-03-01`, `2024-03-01T10:00:00+01:00`) → date locale du texte. */
export const isoDateTime = (raw: string): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return match ? isoDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
};

/** Texte d'un champ : espaces normalisés, caractères de contrôle retirés, longueur bornée. */
export const cleanText = (raw: string | null | undefined, max = 500): string =>
  // eslint-disable-next-line no-control-regex
  (raw ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export const nullableText = (raw: string | null | undefined, max = 500): string | null => {
  const value = cleanText(raw, max);
  return value ? value : null;
};

/** IBAN plausible (forme seulement ; la clé est vérifiée par core/sepa ailleurs). */
export const ibanOrNull = (raw: string | null | undefined): string | null => {
  const value = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(value) ? value : null;
};

/** EndToEndId utile (les banques écrivent `NOTPROVIDED` quand il manque). */
export const endToEndOrNull = (raw: string | null | undefined): string | null => {
  const value = cleanText(raw, 35);
  return value && value.toUpperCase() !== "NOTPROVIDED" ? value : null;
};
