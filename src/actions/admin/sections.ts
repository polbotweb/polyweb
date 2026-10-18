import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, inArray } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { pageSections, pages } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";
import { sanitizeHtml } from "@/lib/sanitize";
import { validateSectionContent as validateStructure } from "@/lib/section-schemas";

/** Maximum total size of serialized section content (500 KB). */
const MAX_CONTENT_SIZE = 500 * 1024;

/** Recursively sanitize string values in parsed section JSON (defense-in-depth). */
export function sanitizeSectionContent(raw: string | Record<string, unknown>): Record<string, unknown> {
  let parsed: unknown;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ActionError({ code: "BAD_REQUEST", message: "Le contenu de section n'est pas du JSON valide." });
    }
  } else {
    parsed = raw;
  }
  function walk(obj: unknown): unknown {
    if (typeof obj === 'string') return sanitizeHtml(obj);
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = walk(v);
      }
      return out;
    }
    return obj;
  }
  return walk(parsed) as Record<string, unknown>;
}

/** Check that the serialized content does not exceed the maximum allowed size. */
function assertContentSize(content: Record<string, unknown>): void {
  const size = JSON.stringify(content).length;
  if (size > MAX_CONTENT_SIZE) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: `Le contenu de section est trop volumineux (${(size / 1024).toFixed(0)} KB). Maximum : ${(MAX_CONTENT_SIZE / 1024).toFixed(0)} KB.`,
    });
  }
}

export const sectionTypes = [
  "hero",
  "text",
  "image",
  "gallery",
  "cta",
  "features",
  "testimonials",
  "faq",
  "contact",
  "map",
  "video",
  "custom",
] as const;

export const createSection = defineAction({
  input: z.object({
    pageId: z.string().min(1, "L'identifiant de la page est requis."),
    type: z.enum(sectionTypes, {
      message: `Le type de section doit être l'un des suivants : ${sectionTypes.join(", ")}.`,
    }),
    content: z.string().min(1, "Le contenu JSON est requis.").max(100_000, "Le contenu JSON ne peut pas dépasser 100 000 caractères.").refine(
      (val) => {
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Le contenu doit être du JSON valide." },
    ),
    sortOrder: z
      .number()
      .int("L'ordre doit être un nombre entier.")
      .min(0, "L'ordre doit être positif.")
      .optional(),
    isVisible: z.boolean().optional(),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { section: ["create"] });
    adminRateLimit(context, user.id, "sections");

    const sanitizedContent = sanitizeSectionContent(input.content);
    assertContentSize(sanitizedContent);

    // Validate content structure against section type schema
    try {
      const structErrors = validateStructure(input.type, sanitizedContent);
      if (structErrors.length > 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: `Contenu de section invalide : ${structErrors.join(' ; ')}`,
        });
      }
    } catch (err) {
      if (err instanceof ActionError) throw err;
      // JSON parse already validated by Zod — this is a safety net
    }

    const db = getDrizzle();

    // Vérifier que la page existe
    const [page] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.id, input.pageId))
      .limit(1);

    if (!page) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "La page spécifiée n'existe pas.",
      });
    }

    const [created] = await db
      .insert(pageSections)
      .values({ ...input, content: sanitizedContent })
      .returning();

    auditAdmin(context, user.id, "PAGE_SECTION_CREATE", {
      resource: "page_sections",
      resourceId: created.id,
      metadata: { pageId: input.pageId, type: created.type },
    });

    invalidateCache("page:");
    return created;
  },
});

export const updateSection = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    type: z
      .enum(sectionTypes, {
        message: `Le type de section doit être l'un des suivants : ${sectionTypes.join(", ")}.`,
      })
      .optional(),
    content: z
      .string()
      .min(1, "Le contenu JSON est requis.")
      .max(100_000, "Le contenu JSON ne peut pas dépasser 100 000 caractères.")
      .refine(
        (val) => {
          try {
            JSON.parse(val);
            return true;
          } catch {
            return false;
          }
        },
        { message: "Le contenu doit être du JSON valide." },
      )
      .optional(),
    sortOrder: z
      .number()
      .int("L'ordre doit être un nombre entier.")
      .min(0, "L'ordre doit être positif.")
      .optional(),
    isVisible: z.boolean().optional(),
    expectedUpdatedAt: z.string().optional(),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { section: ["update"] });
    adminRateLimit(context, user.id, "sections");

    const { id, expectedUpdatedAt, ...data } = input;
    const updateData: Record<string, unknown> = { ...data };
    if (data.content) {
      updateData.content = sanitizeSectionContent(data.content);
      assertContentSize(updateData.content as Record<string, unknown>);

      // Validate structure: use the new type if provided, otherwise fetch current type
      let typeToValidate = data.type;
      if (!typeToValidate) {
        const db0 = getDrizzle();
        const [current] = await db0
          .select({ type: pageSections.type })
          .from(pageSections)
          .where(eq(pageSections.id, id))
          .limit(1);
        typeToValidate = current?.type as typeof data.type;
      }
      if (typeToValidate) {
        const structErrors = validateStructure(typeToValidate, updateData.content as Record<string, unknown>);
        if (structErrors.length > 0) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: `Contenu de section invalide : ${structErrors.join(' ; ')}`,
          });
        }
      }
    }
    const db = getDrizzle();

    const whereClause = expectedUpdatedAt
      ? and(eq(pageSections.id, id), eq(pageSections.updatedAt, new Date(expectedUpdatedAt)))
      : eq(pageSections.id, id);

    const [updated] = await db
      .update(pageSections)
      .set(updateData)
      .where(whereClause)
      .returning();

    if (!updated) {
      if (expectedUpdatedAt) {
        const [exists] = await db.select({ id: pageSections.id }).from(pageSections).where(eq(pageSections.id, id)).limit(1);
        if (exists) {
          throw new ActionError({
            code: "CONFLICT",
            message: "La section a été modifiée par un autre utilisateur. Rechargez et réessayez.",
          });
        }
      }
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Section introuvable.",
      });
    }

    auditAdmin(context, user.id, "PAGE_SECTION_UPDATE", {
      resource: "page_sections",
      resourceId: id,
      metadata: { type: updated.type },
    });

    invalidateCache("page:");
    return updated;
  },
});

export const deleteSection = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { section: ["delete"] });
    adminRateLimit(context, user.id, "sections");

    const db = getDrizzle();
    const [deleted] = await db
      .delete(pageSections)
      .where(eq(pageSections.id, input.id))
      .returning({ id: pageSections.id, type: pageSections.type });

    if (!deleted) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Section introuvable.",
      });
    }

    auditAdmin(context, user.id, "PAGE_SECTION_DELETE", {
      resource: "page_sections",
      resourceId: input.id,
      metadata: { type: deleted.type },
    });

    invalidateCache("page:");
    return { success: true as const };
  },
});

export const reorderSections = defineAction({
  input: z.object({
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          sortOrder: z.number().int().min(0).max(10000),
        }),
      )
      .min(1, "La liste ne peut pas être vide.")
      .max(200, "Maximum 200 éléments par réordonnancement.")
      .refine(
        (items) => new Set(items.map((i) => i.sortOrder)).size === items.length,
        "Les ordres de tri doivent être uniques.",
      ),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { section: ["update"] });
    adminRateLimit(context, user.id, "sections");

    const db = getDrizzle();
    await db.transaction(async (tx) => {
      const ids = input.items.map((i) => i.id);

      // Verify all sections exist and belong to the same page
      const existingSections = await tx
        .select({ id: pageSections.id, pageId: pageSections.pageId })
        .from(pageSections)
        .where(inArray(pageSections.id, ids));
      if (existingSections.length !== ids.length) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Une ou plusieurs sections introuvables.",
        });
      }
      const pageIds = new Set(existingSections.map((s) => s.pageId));
      if (pageIds.size !== 1) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Toutes les sections doivent appartenir à la même page.",
        });
      }

      const cases = input.items
        .map((item) => ({ id: item.id, sortOrder: item.sortOrder }));
      for (const item of cases) {
        await tx
          .update(pageSections)
          .set({ sortOrder: item.sortOrder })
          .where(eq(pageSections.id, item.id));
      }
    });

    auditAdmin(context, user.id, "PAGE_SECTION_REORDER", {
      resource: "page_sections",
      metadata: { reorderedCount: input.items.length },
    });

    invalidateCache("page:");
    return { success: true as const };
  },
});
