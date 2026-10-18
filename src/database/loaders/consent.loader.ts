import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import { consentSettings } from "@database/schemas";
import { isValidLocale } from "@i18n/utils";

export const getConsentSettings = cached(
  (locale: string) => `consent:settings:${locale}`,
  async (locale: string) => {
    if (!isValidLocale(locale)) return null;
    const db = getDrizzle();
    const [row] = await db
      .select()
      .from(consentSettings)
      .where(eq(consentSettings.locale, locale))
      .limit(1);
    return row ?? null;
  },
);
