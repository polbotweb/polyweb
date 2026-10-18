import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, sql, inArray } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { socialLinks } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";

const socialLinkBase = z.object({
  platform: z
    .string()
    .trim()
    .min(1, "Le nom de la plateforme est requis.")
    .max(50, "Le nom de la plateforme ne peut pas dépasser 50 caractères."),
  url: z
    .url("L'URL du réseau social est invalide.")
    .max(500, "L'URL ne peut pas dépasser 500 caractères."),
  icon: z
    .string()
    .trim()
    .max(50, "L'icône ne peut pas dépasser 50 caractères.")
    .nullable()
    .optional(),
  label: z
    .string()
    .trim()
    .max(100, "Le libellé ne peut pas dépasser 100 caractères.")
    .nullable()
    .optional(),
  sortOrder: z
    .number()
    .int("L'ordre doit être un nombre entier.")
    .min(0, "L'ordre doit être positif.")
    .max(10000, "L'ordre ne peut pas d\u00e9passer 10 000.")
    .optional(),
  isActive: z.boolean().optional(),
});

export const createSocialLink = defineAction({
  input: socialLinkBase,
  handler: async (input, context) => {
    const user = await assertPermission(context, { site: ["update"] });
    adminRateLimit(context, user.id, "social");

    const db = getDrizzle();
    let created;
    try {
      [created] = await db.insert(socialLinks).values(input).returning();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        throw new ActionError({
          code: "CONFLICT",
          message: "Un lien social existe déjà pour cette plateforme.",
        });
      }
      throw err;
    }

    auditAdmin(context, user.id, "SOCIAL_LINK_CREATE", {
      resource: "social_links",
      resourceId: created.id,
      metadata: { platform: created.platform },
    });

    invalidateCache("site:social");
    return created;
  },
});

export const updateSocialLink = defineAction({
  input: socialLinkBase.partial().extend({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { site: ["update"] });
    adminRateLimit(context, user.id, "social");

    const { id, ...data } = input;
    const db = getDrizzle();
    const [updated] = await db
      .update(socialLinks)
      .set(data)
      .where(eq(socialLinks.id, id))
      .returning();

    if (!updated) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Lien social introuvable.",
      });
    }

    auditAdmin(context, user.id, "SOCIAL_LINK_UPDATE", {
      resource: "social_links",
      resourceId: id,
      metadata: { platform: updated.platform },
    });

    invalidateCache("site:social");
    return updated;
  },
});

export const deleteSocialLink = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { site: ["update"] });
    adminRateLimit(context, user.id, "social");

    const db = getDrizzle();
    const [deleted] = await db
      .delete(socialLinks)
      .where(eq(socialLinks.id, input.id))
      .returning({ id: socialLinks.id });

    if (!deleted) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Lien social introuvable.",
      });
    }

    auditAdmin(context, user.id, "SOCIAL_LINK_DELETE", {
      resource: "social_links",
      resourceId: input.id,
    });

    invalidateCache("site:social");
    return { success: true as const };
  },
});

export const reorderSocialLinks = defineAction({
  input: z.object({
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          sortOrder: z.number().int().min(0).max(10000),
        }),
      )
      .min(1, "La liste ne peut pas être vide.")
      .max(200, "Maximum 200 éléments par réordonnancement."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { site: ["update"] });
    adminRateLimit(context, user.id, "social");

    const db = getDrizzle();
    await db.transaction(async (tx) => {
      const ids = input.items.map((i) => i.id);
      const cases = input.items
        .map((item) => sql`WHEN ${socialLinks.id} = ${item.id} THEN ${item.sortOrder}`)
        .reduce((a, b) => sql`${a} ${b}`);
      const updated = await tx
        .update(socialLinks)
        .set({ sortOrder: sql`CASE ${cases} END` })
        .where(inArray(socialLinks.id, ids))
        .returning({ id: socialLinks.id });
      if (updated.length !== input.items.length) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Un ou plusieurs liens sociaux introuvables.",
        });
      }
    });

    auditAdmin(context, user.id, "SOCIAL_LINK_REORDER", {
      resource: "social_links",
      metadata: { reorderedCount: input.items.length },
    });

    invalidateCache("site:social");
    return { success: true as const };
  },
});
