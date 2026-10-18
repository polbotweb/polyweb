import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { siteSettings } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";
import { isValidLocale } from "@i18n/utils";

const urlField = z.string().max(500).refine((v) => !v || /^(https?:\/\/|\/(?!\/))/.test(v), "L'URL doit commencer par http://, https:// ou /").nullable().optional();

export const upsertSiteSettings = defineAction({
  input: z.object({
    locale: z.string().min(2).max(5),
    siteName: z.string().trim().min(1, "Le nom du site est requis.").max(200).optional(),
    siteDescription: z.string().trim().max(500).nullable().optional(),
    siteSlogan: z.string().trim().max(200).nullable().optional(),
    metaTitle: z.string().trim().max(70).nullable().optional(),
    metaDescription: z.string().trim().max(160).nullable().optional(),
    logoLight: urlField,
    logoDark: urlField,
    favicon: urlField,
    ogImage: urlField,
    // Header layout
    headerCtaText: z.string().trim().max(100).nullable().optional(),
    headerCtaUrl: urlField,
    headerSecondaryText: z.string().trim().max(100).nullable().optional(),
    headerSecondaryUrl: urlField,
    headerSticky: z.boolean().optional(),
    // Footer layout
    footerCopyrightText: z.string().trim().max(200).nullable().optional(),
    footerCopyrightUrl: urlField,
    footerSocialHeading: z.string().trim().max(100).nullable().optional(),
    footerNavPrimaryHeading: z.string().trim().max(100).nullable().optional(),
    footerNavSecondaryHeading: z.string().trim().max(100).nullable().optional(),
    footerLegalHeading: z.string().trim().max(100).nullable().optional(),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { site: ["update"] });
    adminRateLimit(context, user.id, "site");

    if (!isValidLocale(input.locale)) {
      throw new ActionError({ code: "BAD_REQUEST", message: "Locale invalide." });
    }

    const { locale, ...data } = input;
    const db = getDrizzle();

    // Check if row exists for this locale
    const [existing] = await db
      .select({ id: siteSettings.id })
      .from(siteSettings)
      .where(eq(siteSettings.locale, locale))
      .limit(1);

    let result;
    if (existing) {
      [result] = await db
        .update(siteSettings)
        .set(data)
        .where(eq(siteSettings.id, existing.id))
        .returning();
    } else {
      if (!data.siteName) {
        throw new ActionError({ code: "BAD_REQUEST", message: "Le nom du site est requis pour la première configuration." });
      }
      [result] = await db
        .insert(siteSettings)
        .values({ locale, ...data, siteName: data.siteName })
        .returning();
    }

    auditAdmin(context, user.id, "SITE_SETTINGS_UPDATE", {
      resource: "site_settings",
      resourceId: result.id,
      metadata: { locale },
    });

    invalidateCache(`site:settings:${locale}`);
    return result;
  },
});

export const updateSiteSettings = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    siteName: z.string().trim().min(1, "Le nom du site est requis.").max(200, "Le nom du site ne peut pas dépasser 200 caractères.").optional(),
    siteDescription: z.string().trim().max(500, "La description ne peut pas dépasser 500 caractères.").nullable().optional(),
    siteSlogan: z.string().trim().max(200, "Le slogan ne peut pas dépasser 200 caractères.").nullable().optional(),
    metaTitle: z.string().trim().max(70, "Le meta title ne peut pas dépasser 70 caractères.").nullable().optional(),
    metaDescription: z.string().trim().max(160, "La meta description ne peut pas dépasser 160 caractères.").nullable().optional(),
    logoLight: urlField,
    logoDark: urlField,
    favicon: urlField,
    ogImage: urlField,
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { site: ["update"] });
    adminRateLimit(context, user.id, "site");

    const { id, ...data } = input;
    const db = getDrizzle();
    const [updated] = await db
      .update(siteSettings)
      .set(data)
      .where(eq(siteSettings.id, id))
      .returning();

    if (!updated) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Paramètre de site introuvable.",
      });
    }

    auditAdmin(context, user.id, "SITE_SETTINGS_UPDATE", {
      resource: "site_settings",
      resourceId: id,
      metadata: { locale: updated.locale },
    });

    invalidateCache(`site:settings:${updated.locale}`);
    return updated;
  },
});
