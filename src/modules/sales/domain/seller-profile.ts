/**
 * Profil vendeur (identité légale de l'émetteur) : normalisation et validation pures.
 * IBAN : format + clé ISO 13616 (mod 97) ; BIC : ISO 9362 ; SIREN (`0002`) : 9 chiffres + Luhn ;
 * n° de TVA : préfixe pays + 2 à 13 caractères alphanumériques (contrôle VIES hors périmètre).
 */
import { Effect } from "effect";
import { InvalidSellerProfileError } from "./errors";

export interface SellerProfileInput {
  readonly legalName: string;
  readonly vatNumber?: string | null;
  readonly legalId?: string | null;
  readonly legalIdScheme?: string | null;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly postcode?: string | null;
  readonly city?: string | null;
  readonly country: string;
  readonly email?: string | null;
  readonly iban?: string | null;
  readonly bic?: string | null;
}

export type SellerProfile = { readonly [K in keyof SellerProfileInput]-?: SellerProfileInput[K] extends string ? string : string | null };

/** Schéma ISO 6523 du SIREN français. */
export const SIREN_SCHEME = "0002";

const compact = (value: string | null | undefined) => {
  const trimmed = value?.replace(/\s+/g, " ").trim() ?? "";
  return trimmed === "" ? null : trimmed;
};
const code = (value: string | null | undefined) => compact(value)?.replace(/[\s.-]/g, "").toUpperCase() ?? null;

export const isValidIban = (iban: string): boolean => {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
};

export const isValidSiren = (siren: string): boolean => {
  if (!/^\d{9}$/.test(siren)) return false;
  let sum = 0;
  for (const [index, char] of [...siren].entries()) {
    let digit = Number(char);
    if (index % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return sum % 10 === 0;
};

const fail = (field: InvalidSellerProfileError["field"], value: string) => Effect.fail(new InvalidSellerProfileError({ field, value }));

export const normalizeSellerProfile = (input: SellerProfileInput): Effect.Effect<SellerProfile, InvalidSellerProfileError> =>
  Effect.gen(function* () {
    const legalName = compact(input.legalName);
    if (!legalName || legalName.length > 200) return yield* fail("legalName", input.legalName);
    const country = code(input.country) ?? "";
    if (!/^[A-Z]{2}$/.test(country)) return yield* fail("country", input.country);
    const vatNumber = code(input.vatNumber);
    if (vatNumber && !/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vatNumber)) return yield* fail("vatNumber", vatNumber);
    const legalIdScheme = code(input.legalIdScheme);
    if (legalIdScheme && !/^\d{4}$/.test(legalIdScheme)) return yield* fail("legalIdScheme", legalIdScheme);
    const legalId = code(input.legalId);
    if (legalId && (legalId.length > 50 || (legalIdScheme === SIREN_SCHEME && !isValidSiren(legalId)))) return yield* fail("legalId", legalId);
    const email = compact(input.email);
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return yield* fail("email", email);
    const iban = code(input.iban);
    if (iban && !isValidIban(iban)) return yield* fail("iban", iban);
    const bic = code(input.bic);
    if (bic && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return yield* fail("bic", bic);
    const postcode = compact(input.postcode);
    if (postcode && postcode.length > 20) return yield* fail("postcode", postcode);
    const text = (value: string | null | undefined) => compact(value)?.slice(0, 200) ?? null;
    return {
      legalName, vatNumber, legalId, legalIdScheme: legalId ? legalIdScheme : null,
      addressLine1: text(input.addressLine1), addressLine2: text(input.addressLine2), postcode, city: text(input.city),
      country, email, iban, bic,
    };
  });
