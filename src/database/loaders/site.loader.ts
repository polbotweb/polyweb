import { eq, asc } from "drizzle-orm";
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

export const getSiteSettings = cached(
  (locale: string) => `site:settings:${locale}`,
  async (locale: string) => {
    if (!isValidLocale(locale)) return null;
    const db = getDrizzle();
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.locale, locale))
      .limit(1);
    return row ?? null;
  },
);

export const getSocialLinks = cached(
  () => "site:social",
  async () => {
    const db = getDrizzle();
    return db
      .select()
      .from(socialLinks)
      .where(eq(socialLinks.isActive, true))
      .orderBy(asc(socialLinks.sortOrder))
      .limit(100);
  },
);

export const getContactInfo = cached(
  () => "site:contact",
  async () => {
    const db = getDrizzle();
    const [row] = await db.select().from(contactInfo).limit(1);
    return row ?? null;
  },
);

export const getOpeningHours = cached(
  () => "site:hours",
  async () => {
    const db = getDrizzle();
    return db
      .select()
      .from(openingHours)
      .orderBy(asc(openingHours.dayOfWeek))
      .limit(50);
  },
);

export const getActiveTheme = cached(
  () => "site:theme",
  async () => {
    const db = getDrizzle();
    const [row] = await db
      .select()
      .from(themeSettings)
      .where(eq(themeSettings.isActive, true))
      .limit(1);
    return row ?? null;
  },
);

export const getAllThemes = cached(
  () => "site:themes",
  async () => {
    const db = getDrizzle();
    return db.select().from(themeSettings).orderBy(asc(themeSettings.name)).limit(100);
  },
);

/** Returns injectable CSS for the active theme, or empty string if no theme / using defaults. */
export const getActiveThemeCss = cached(
  () => "site:theme:css",
  async () => {
    const theme = await getActiveTheme();
    if (!theme) return '';

    const light = parseTokenMap(theme.lightTokens) ?? buildLegacyTokenMap(theme, 'light');
    const dark = parseTokenMap(theme.darkTokens) ?? buildLegacyTokenMap(theme, 'dark');

    return generateThemeCss(light, dark, theme.borderRadius);
  },
);

/** Build a token map from legacy individual columns (backward compat). */
function buildLegacyTokenMap(
  theme: NonNullable<Awaited<ReturnType<typeof getActiveTheme>>>,
  _mode: 'light' | 'dark',
) {
  const base = _mode === 'light' ? { ...DEFAULT_LIGHT_TOKENS } : { ...DEFAULT_DARK_TOKENS };
  if (theme.primaryColor) base['primary'] = theme.primaryColor;
  if (theme.secondaryColor) base['secondary'] = theme.secondaryColor;
  if (theme.accentColor) base['accent'] = theme.accentColor;
  if (theme.backgroundColor) base['background'] = theme.backgroundColor;
  if (theme.foregroundColor) base['foreground'] = theme.foregroundColor;
  if (theme.mutedColor) base['muted'] = theme.mutedColor;
  if (theme.mutedForegroundColor) base['muted-foreground'] = theme.mutedForegroundColor;
  return base;
}
