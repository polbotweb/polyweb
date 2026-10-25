import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import { consentSettings } from "@database/schemas";
import { isValidLocale } from "@i18n/utils";
import { dbTry, runOrThrow } from "@/lib/effect/run";

/** Réglages de consentement d'une locale (null si absents ou locale invalide). */
const consentSettingsEffect = (locale: string) =>
  isValidLocale(locale)
    ? dbTry("consent.settings", () =>
        getDrizzle().select().from(consentSettings).where(eq(consentSettings.locale, locale)).limit(1),
      ).pipe(Effect.map(([row]) => row ?? null))
    : Effect.succeed(null);

export const consentLoaderEffects = { getConsentSettings: consentSettingsEffect };

/** Adaptateur Promise mis en cache (clé inchangée). */
export const getConsentSettings = cached(
  (locale: string) => `consent:settings:${locale}`,
  (locale: string) => runOrThrow(consentSettingsEffect(locale)),
);
