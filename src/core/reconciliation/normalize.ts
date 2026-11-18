/** Normalisation des références, noms et IBAN pour la comparaison (pur). */

/** Majuscules, sans accents, uniquement lettres et chiffres. */
export const normalizeReference = (value: string | null | undefined): string =>
  (value ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const normalizeIban = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, "").toUpperCase();

const LEGAL_FORMS = new Set([
  "SA", "SAS", "SASU", "SARL", "EURL", "SNC", "SCI", "SCOP", "EI", "EIRL", "GIE", "SELARL", "SCM",
  "GMBH", "AG", "KG", "UG", "LTD", "LIMITED", "PLC", "LLC", "INC", "CORP", "CO", "BV", "NV", "SRL", "SPA", "SL", "SLU",
  "STE", "SOCIETE", "ETS", "ETABLISSEMENTS", "CIE", "ET", "DE", "DU", "DES", "LA", "LE", "LES", "THE", "AND",
]);

/** Jetons significatifs d'un nom (formes juridiques et mots vides retirés). */
export const nameTokens = (value: string | null | undefined): Set<string> =>
  new Set(
    (value ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().split(/[^A-Z0-9]+/)
      .filter((token) => token.length >= 2 && !LEGAL_FORMS.has(token)),
  );

/** Similarité de Jaccard des jetons (0..1) ; un nom contenu dans le libellé compte comme 1. */
export const nameSimilarity = (a: string | null | undefined, b: string | null | undefined): number => {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  if (common === Math.min(left.size, right.size)) return 1;
  return common / (left.size + right.size - common);
};

/** Une référence normalisée d'au moins 4 caractères figure-t-elle dans le texte normalisé ? */
export const referenceFound = (reference: string, haystack: string): boolean => {
  const ref = normalizeReference(reference);
  return ref.length >= 4 && haystack.includes(ref);
};

/** Écart en jours entre deux dates ISO (valeur absolue), `null` si l'une manque. */
export const daysBetween = (a: string | null | undefined, b: string | null | undefined): number | null => {
  if (!a || !b) return null;
  const left = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const right = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.abs(Math.round((left - right) / 86_400_000));
};
