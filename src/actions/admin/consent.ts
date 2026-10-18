import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { consentSettings } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";
import { isValidLocale } from "@i18n/utils";

export const updateConsentSettings = defineAction({
  input: z.object({
    locale: z.string().min(2).max(5),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    acceptAll: z.string().trim().min(1).max(100).optional(),
    rejectAll: z.string().trim().min(1).max(100).optional(),
    customize: z.string().trim().min(1).max(100).optional(),
    savePreferences: z.string().trim().min(1).max(100).optional(),
    necessaryLabel: z.string().trim().min(1).max(200).optional(),
    necessaryDescription: z.string().trim().min(1).max(1000).optional(),
    analyticsLabel: z.string().trim().min(1).max(200).optional(),
    analyticsDescription: z.string().trim().min(1).max(1000).optional(),
    marketingLabel: z.string().trim().min(1).max(200).optional(),
    marketingDescription: z.string().trim().min(1).max(1000).optional(),
    privacyPolicyLabel: z.string().trim().min(1).max(200).optional(),
    privacyPolicyUrl: z
      .string()
      .max(500)
      .refine((v) => !v || /^(https?:\/\/|\/(?!\/))/.test(v), "L'URL doit commencer par http://, https:// ou /")
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { site: ["update"] });
    adminRateLimit(context, user.id, "consent");

    if (!isValidLocale(input.locale)) {
      throw new ActionError({ code: "BAD_REQUEST", message: "Locale invalide." });
    }

    const { locale, ...data } = input;
    const db = getDrizzle();

    const [existing] = await db
      .select({ id: consentSettings.id })
      .from(consentSettings)
      .where(eq(consentSettings.locale, locale))
      .limit(1);

    if (!existing) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: `Aucune configuration de consentement pour la locale « ${locale} ». Lancez le seed d'abord.`,
      });
    }

    const [result] = await db
      .update(consentSettings)
      .set(data)
      .where(eq(consentSettings.id, existing.id))
      .returning();

    auditAdmin(context, user.id, "CONSENT_SETTINGS_UPDATE", {
      resource: "consent_settings",
      resourceId: result.id,
      metadata: { locale },
    });

    invalidateCache(`consent:settings:${locale}`);
    return result;
  },
});
