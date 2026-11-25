/**
 * Export CSV des lignes et écritures (B14) : RFC 4180, séparateur `;` (Excel FR), BOM UTF-8, et
 * neutralisation des formules (OWASP « CSV injection ») : toute cellule commençant par `=`, `+`,
 * `-`, `@`, tabulation ou retour chariot est préfixée d'une apostrophe — sauf un nombre signé pur.
 */
const DANGEROUS = /^[=+\-@\t\r]/;
const NUMBER = /^-?\d+([.,]\d+)?$/;

export const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value !== "number" && DANGEROUS.test(text) && !NUMBER.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string =>
  `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;

/** Montant en unités mineures → décimal à virgule (export FR). */
export const minorToDecimal = (minor: number, exponent = 2): string => {
  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(exponent + 1, "0");
  const value = exponent === 0 ? digits : `${digits.slice(0, -exponent)},${digits.slice(-exponent)}`;
  return negative ? `-${value}` : value;
};
