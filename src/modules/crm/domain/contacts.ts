/**
 * Règles pures des contacts et sociétés : normalisation (e-mail en minuscules, téléphone sans
 * séparateurs, site avec schéma https), validation, nom affiché, clé de dédoublonnage.
 */
import { Effect } from "effect";
import { InvalidContactError } from "./errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9]{6,15}$/;

const blankToNull = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

export const normalizeEmail = (email: string | null | undefined): Effect.Effect<string | null, InvalidContactError> => {
  const v = blankToNull(email)?.toLowerCase() ?? null;
  return v === null || EMAIL.test(v) ? Effect.succeed(v) : Effect.fail(new InvalidContactError({ field: "email", value: v }));
};

export const normalizePhone = (phone: string | null | undefined): Effect.Effect<string | null, InvalidContactError> => {
  const raw = blankToNull(phone);
  if (raw === null) return Effect.succeed(null);
  const v = raw.replace(/[\s().-]/g, "").replace(/^00/, "+");
  return PHONE.test(v) ? Effect.succeed(v) : Effect.fail(new InvalidContactError({ field: "phone", value: raw }));
};

export const normalizeWebsite = (website: string | null | undefined): Effect.Effect<string | null, InvalidContactError> => {
  const raw = blankToNull(website);
  if (raw === null) return Effect.succeed(null);
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) throw new Error("host");
    return Effect.succeed(url.toString());
  } catch {
    return Effect.fail(new InvalidContactError({ field: "website", value: raw }));
  }
};

export const normalizeCountry = (country: string | null | undefined): Effect.Effect<string | null, InvalidContactError> => {
  const v = blankToNull(country)?.toUpperCase() ?? null;
  return v === null || /^[A-Z]{2}$/.test(v) ? Effect.succeed(v) : Effect.fail(new InvalidContactError({ field: "country", value: v }));
};

export const requireName = (name: string | null | undefined): Effect.Effect<string, InvalidContactError> => {
  const v = blankToNull(name);
  return v === null || v.length > 200 ? Effect.fail(new InvalidContactError({ field: "name", value: String(name ?? "") })) : Effect.succeed(v);
};

export const contactDisplayName = (c: { firstName?: string | null; lastName: string }) => [blankToNull(c.firstName), c.lastName.trim()].filter(Boolean).join(" ");

/** Clé de dédoublonnage : e-mail normalisé, sinon nom complet sans accents ni casse. */
export const contactDedupKey = (c: { email?: string | null; firstName?: string | null; lastName: string }) => {
  const email = blankToNull(c.email)?.toLowerCase();
  if (email) return `email:${email}`;
  return `name:${contactDisplayName(c).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ")}`;
};
