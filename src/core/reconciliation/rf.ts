/**
 * Référence structurée de créancier ISO 11649 (`RFkk…`) : validation et création.
 * Contrôle modulo 97 (ISO 7064) après déplacement de `RFkk` en fin et conversion A=10…Z=35.
 */
const numeric = (value: string) => [...value].map((char) => (/[0-9]/.test(char) ? char : String(char.charCodeAt(0) - 55))).join("");

const mod97 = (digits: string) => {
  let rest = 0;
  for (let index = 0; index < digits.length; index += 7) rest = Number(`${rest}${digits.slice(index, index + 7)}`) % 97;
  return rest;
};

export const isValidRfReference = (raw: string): boolean => {
  const value = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(value)) return false;
  return mod97(numeric(`${value.slice(4)}${value.slice(0, 4)}`)) === 1;
};

/** `RF` + clé + base (1 à 21 caractères alphanumériques). */
export const makeRfReference = (base: string): string => {
  const ref = base.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 21);
  if (!ref) throw new RangeError("référence vide");
  const check = 98 - mod97(numeric(`${ref}RF00`));
  return `RF${String(check).padStart(2, "0")}${ref}`;
};

/** Extrait les références RF valides d'un texte libre (espaces tolérés à l'intérieur de la référence). */
export const extractRfReferences = (text: string): string[] => {
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const found = new Set<string>();
  for (let index = compact.indexOf("RF"); index >= 0; index = compact.indexOf("RF", index + 2)) {
    for (let length = 25; length >= 5; length--) {
      const candidate = compact.slice(index, index + length);
      if (candidate.length === length && isValidRfReference(candidate)) { found.add(candidate); break; }
    }
  }
  return [...found];
};
