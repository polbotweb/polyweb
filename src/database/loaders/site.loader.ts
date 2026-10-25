import { eq, asc } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import {
  siteSettings,
  socialLinks,
  contactInfo,
  openingHours,
  themeSettings,
} from "@database/schemas";
import { parseTokenMap, generateThemeCss, DEFAULT_LIGHT_TOKENS, DEFAULT_DARK_TOKENS } from "@/lib/theme-tokens";
import { isValidLocale } from "@i18n/utils";
import type { DbError } from "@/lib/effect/errors";
import { dbTry, runOrThrow } from "@/lib/effect/run";

/*
 * Réglages du site Effect-natifs (`dbTry` : DbError typé, span `db.site.<op>`).
 * Les exports Promise restent `cached(...)` (clés inchangées) autour d'un adaptateur `runOrThrow`.
 */
const first = <T>(rows: T[]): T | null => rows[0] ?? null;

const siteSettingsEffect = (locale: string) =>
  isValidLocale(locale)
    ? dbTry("site.settings", () => getDrizzle().select().from(siteSettings).where(eq(siteSettings.locale, locale)).limit(1)).pipe(
        Effect.map(first),
      )
    : Effect.succeed(null);

const socialLinksEffect = () =>
  dbTry("site.socialLinks", () =>
    getDrizzle().select().from(socialLinks).where(eq(socialLinks.isActive, true)).orderBy(asc(socialLinks.sortOrder)).limit(100),
  );

const contactInfoEffect = () => dbTry("site.contactInfo", () => getDrizzle().select().from(contactInfo).limit(1)).pipe(Effect.map(first));

const openingHoursEffect = () =>
  dbTry("site.openingHours", () => getDrizzle().select().from(openingHours).orderBy(asc(openingHours.dayOfWeek)).limit(50));

const activeThemeEffect = () =>
  dbTry("site.activeTheme", () => getDrizzle().select().from(themeSettings).where(eq(themeSettings.isActive, true)).limit(1)).pipe(
    Effect.map(first),
  );

const allThemesEffect = () =>
  dbTry("site.themes", () => getDrizzle().select().from(themeSettings).orderBy(asc(themeSettings.name)).limit(100));

type Theme = typeof themeSettings.$inferSelect;

/** CSS injectable du thème actif ('' sans thème). */
const themeCssOf = (theme: Theme | null): string => {
  if (!theme) return "";
  const light = parseTokenMap(theme.lightTokens) ?? buildLegacyTokenMap(theme, "light");
  const dark = parseTokenMap(theme.darkTokens) ?? buildLegacyTokenMap(theme, "dark");
  return generateThemeCss(light, dark, theme.borderRadius);
};

const activeThemeCssEffect = (): Effect.Effect<string, DbError> => activeThemeEffect().pipe(Effect.map(themeCssOf));

/** Lectures Effect-natives NON mises en cache (`effect.ts` garde les versions `cached`). */
export const siteLoaderEffects = {
  getSiteSettings: siteSettingsEffect,
  getSocialLinks: socialLinksEffect,
  getContactInfo: contactInfoEffect,
  getOpeningHours: openingHoursEffect,
  getActiveTheme: activeThemeEffect,
  getAllThemes: allThemesEffect,
  getActiveThemeCss: activeThemeCssEffect,
};

export const getSiteSettings = cached(
  (locale: string) => `site:settings:${locale}`,
  (locale: string) => runOrThrow(siteSettingsEffect(locale)),
);

export const getSocialLinks = cached(() => "site:social", () => runOrThrow(socialLinksEffect()));

export const getContactInfo = cached(() => "site:contact", () => runOrThrow(contactInfoEffect()));

export const getOpeningHours = cached(() => "site:hours", () => runOrThrow(openingHoursEffect()));

export const getActiveTheme = cached(() => "site:theme", () => runOrThrow(activeThemeEffect()));

export const getAllThemes = cached(() => "site:themes", () => runOrThrow(allThemesEffect()));

/** Returns injectable CSS for the active theme, or empty string if no theme / using defaults. */
export const getActiveThemeCss = cached(
  () => "site:theme:css",
  // Réutilise le thème mis en cache (même comportement qu'avant la migration).
  async () => themeCssOf(await getActiveTheme()),
);

/** Build a token map from legacy individual columns (backward compat). */
function buildLegacyTokenMap(theme: Theme, _mode: "light" | "dark") {
  const base = _mode === "light" ? { ...DEFAULT_LIGHT_TOKENS } : { ...DEFAULT_DARK_TOKENS };
  if (theme.primaryColor) base["primary"] = theme.primaryColor;
  if (theme.secondaryColor) base["secondary"] = theme.secondaryColor;
  if (theme.accentColor) base["accent"] = theme.accentColor;
  if (theme.backgroundColor) base["background"] = theme.backgroundColor;
  if (theme.foregroundColor) base["foreground"] = theme.foregroundColor;
  if (theme.mutedColor) base["muted"] = theme.mutedColor;
  if (theme.mutedForegroundColor) base["muted-foreground"] = theme.mutedForegroundColor;
  return base;
}
