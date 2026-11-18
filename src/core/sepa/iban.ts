/** Contrôle IBAN (ISO 13616, modulo 97) et BIC (ISO 9362). Pur. */
const IBAN_RE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/;
const BIC_RE = /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;

export const normalizeIban = (value: string) => value.replace(/\s+/g, "").toUpperCase();
export const normalizeBic = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/** IBAN valide : longueur 15–34, chiffres de contrôle modulo 97 = 1. */
export const isValidIban = (value: string) => {
  const iban = normalizeIban(value);
  if (!IBAN_RE.test(iban) || iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let acc = 0;
  for (const char of rearranged) {
    const code = char >= "0" && char <= "9" ? char : String(char.charCodeAt(0) - 55);
    for (const digit of code) acc = (acc * 10 + Number(digit)) % 97;
  }
  return acc === 1;
};

export const isValidBic = (value: string) => BIC_RE.test(normalizeBic(value));
