import { defineAction, ActionError } from "astro:actions";
import { Effect } from "effect";
import { z } from "astro/zod";
import { eq, sql, inArray } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { socialLinks } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { auditAdmin } from "./_helpers";
import { actionRateLimit, actionTry, effectHandler, fail, requireActionPermission } from "@/lib/effect/action";

const guard = (context: Parameters<typeof requireActionPermission>[0]) =>
  Effect.tap(requireActionPermission(context, { site: ["update"] }), (user) => actionRateLimit(user.id, "social"));

const isUnique = (err: unknown) => typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505";

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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* guard(context);
    const inserted = yield* actionTry("social.create", () => getDrizzle().insert(socialLinks).values(input).returning()).pipe(
      Effect.catchIf(
        (e) => e._tag === "OperationError" && isUnique(e.cause),
        () => fail("CONFLICT", "Un lien social existe déjà pour cette plateforme."),
      ),
    );
    const created = inserted[0]!;

    auditAdmin(context, user.id, "SOCIAL_LINK_CREATE", {
      resource: "social_links",
      resourceId: created.id,
      metadata: { platform: created.platform },
    });

    invalidateCache("site:social");
    return created;
  })),
});

export const updateSocialLink = defineAction({
  input: socialLinkBase.partial().extend({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* guard(context);
    const { id, ...data } = input;
    const [updated] = yield* actionTry("social.update", () => getDrizzle().update(socialLinks).set(data).where(eq(socialLinks.id, id)).returning());
    if (!updated) return yield* fail("NOT_FOUND", "Lien social introuvable.");

    auditAdmin(context, user.id, "SOCIAL_LINK_UPDATE", {
      resource: "social_links",
      resourceId: id,
      metadata: { platform: updated.platform },
    });

    invalidateCache("site:social");
    return updated;
  })),
});

export const deleteSocialLink = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* guard(context);
    const [deleted] = yield* actionTry("social.delete", () => getDrizzle().delete(socialLinks).where(eq(socialLinks.id, input.id)).returning({ id: socialLinks.id }));
    if (!deleted) return yield* fail("NOT_FOUND", "Lien social introuvable.");

    auditAdmin(context, user.id, "SOCIAL_LINK_DELETE", {
      resource: "social_links",
      resourceId: input.id,
    });

    invalidateCache("site:social");
    return { success: true as const };
  })),
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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* guard(context);
    yield* actionTry("social.reorder", () => getDrizzle().transaction(async (tx) => {
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
        throw new ActionError({ code: "NOT_FOUND", message: "Un ou plusieurs liens sociaux introuvables." });
      }
    }));

    auditAdmin(context, user.id, "SOCIAL_LINK_REORDER", {
      resource: "social_links",
      metadata: { reorderedCount: input.items.length },
    });

    invalidateCache("site:social");
    return { success: true as const };
  })),
});
