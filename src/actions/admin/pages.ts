import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, asc, desc, isNull, isNotNull, inArray, max } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { pages, pageSections, pageVersions } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";
import { LOCALES } from "@i18n/config";

const localeEnum = z.enum(LOCALES, {
  message: `La locale doit être l'une des suivantes : ${LOCALES.join(", ")}.`,
});

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slugs that would shadow real Astro routes / API endpoints. */
const RESERVED_SLUGS = new Set([
  'api', 'auth', 'admin', 'sitemap-cms.xml', 'sitemap',
  'robots.txt', 'rss.xml', '_image', '_actions', 'health', 'uploads',
  '404', '500', 'index', 'preview', 'media', 'contact',
  'export-data', 'audit-export', 'upload', 'search', 'cron',
  'content-export', 'content-import',
]);

function assertSlugNotReserved(slug: string) {
  if (RESERVED_SLUGS.has(slug)) {
    throw new ActionError({
      code: 'CONFLICT',
      message: `Le slug « ${slug} » est réservé et ne peut pas être utilisé pour une page CMS.`,
    });
  }
}

export const createPage = defineAction({
  input: z.object({
    locale: localeEnum,
    slug: z
      .string()
      .trim()
      .min(1, "Le slug est requis.")
      .max(200, "Le slug ne peut pas dépasser 200 caractères.")
      .regex(slugRegex, "Le slug ne peut contenir que des lettres minuscules, chiffres et tirets."),
    title: z
      .string()
      .trim()
      .min(1, "Le titre est requis.")
      .max(200, "Le titre ne peut pas dépasser 200 caractères."),
    metaTitle: z.string().trim().max(70, "Le meta title ne peut pas dépasser 70 caractères.").nullable().optional(),
    metaDescription: z.string().trim().max(160, "La meta description ne peut pas dépasser 160 caractères.").nullable().optional(),
    ogImage: z.url("L'URL de l'image OG est invalide.").nullable().optional(),
    canonical: z.url("L'URL canonique est invalide.").nullable().optional(),
    robots: z.string().trim().max(200, "Le champ robots ne peut pas dépasser 200 caractères.").nullable().optional(),
    template: z.string().max(50, "Le template ne peut pas dépasser 50 caractères.").optional(),
    sortOrder: z.number().int("L'ordre doit être un nombre entier.").min(0, "L'ordre doit être positif.").max(10000, "L'ordre ne peut pas dépasser 10 000.").nullable().optional(),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["create"] });
    adminRateLimit(context, user.id, "pages");

    assertSlugNotReserved(input.slug);
    const db = getDrizzle();

    // Auto-assign sortOrder if not provided (next available in increments of 10)
    let sortOrder = input.sortOrder;
    if (sortOrder === undefined || sortOrder === null) {
      const [row] = await db
        .select({ maxSort: max(pages.sortOrder) })
        .from(pages)
        .where(and(eq(pages.locale, input.locale), isNull(pages.deletedAt)));
      sortOrder = (row?.maxSort ?? 0) + 10;
    }

    let created;
    try {
      [created] = await db.insert(pages).values({ ...input, sortOrder, updatedBy: user.id }).returning();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        throw new ActionError({
          code: "CONFLICT",
          message: `Une page avec le slug \u00ab ${input.slug} \u00bb existe d\u00e9j\u00e0 pour la locale \u00ab ${input.locale} \u00bb.`,
        });
      }
      throw err;
    }

    auditAdmin(context, user.id, "PAGE_CREATE", {
      resource: "pages",
      resourceId: created.id,
      metadata: { locale: created.locale, slug: created.slug },
    });

    invalidateCache("page:");
    return created;
  },
});

export const updatePage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    slug: z
      .string()
      .trim()
      .min(1, "Le slug est requis.")
      .max(200, "Le slug ne peut pas dépasser 200 caractères.")
      .regex(slugRegex, "Le slug ne peut contenir que des lettres minuscules, chiffres et tirets.")
      .optional(),
    title: z.string().trim().min(1, "Le titre est requis.").max(200, "Le titre ne peut pas dépasser 200 caractères.").optional(),
    metaTitle: z.string().trim().max(70, "Le meta title ne peut pas dépasser 70 caractères.").nullable().optional(),
    metaDescription: z.string().trim().max(160, "La meta description ne peut pas dépasser 160 caractères.").nullable().optional(),
    ogImage: z.url("L'URL de l'image OG est invalide.").nullable().optional(),
    canonical: z.url("L'URL canonique est invalide.").nullable().optional(),
    robots: z.string().trim().max(200, "Le champ robots ne peut pas dépasser 200 caractères.").nullable().optional(),
    template: z.string().max(50, "Le template ne peut pas dépasser 50 caractères.").optional(),
    sortOrder: z.number().int("L'ordre doit être un nombre entier.").min(0, "L'ordre doit être positif.").max(10000, "L'ordre ne peut pas dépasser 10 000.").optional(),
    expectedUpdatedAt: z.string().optional(),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["update"] });
    adminRateLimit(context, user.id, "pages");

    const { id, expectedUpdatedAt, ...data } = input;
    if (data.slug) assertSlugNotReserved(data.slug);

    const db = getDrizzle();

    // Check content lock before updating
    const [lockCheck] = await db
      .select({ lockedBy: pages.lockedBy, lockedAt: pages.lockedAt })
      .from(pages)
      .where(eq(pages.id, id))
      .limit(1);
    if (lockCheck) assertNotLockedByOther(lockCheck, user.id);

    const whereClause = expectedUpdatedAt
      ? and(eq(pages.id, id), eq(pages.updatedAt, new Date(expectedUpdatedAt)))
      : eq(pages.id, id);

    let updated;
    try {
      [updated] = await db
        .update(pages)
        .set({ ...data, updatedBy: user.id })
        .where(whereClause)
        .returning();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        throw new ActionError({
          code: "CONFLICT",
          message: `Une autre page utilise déjà le slug « ${data.slug} » pour cette locale.`,
        });
      }
      throw err;
    }

    if (!updated) {
      if (expectedUpdatedAt) {
        const [exists] = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, id)).limit(1);
        if (exists) {
          throw new ActionError({
            code: "CONFLICT",
            message: "La page a été modifiée par un autre utilisateur. Rechargez et réessayez.",
          });
        }
      }
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Page introuvable.",
      });
    }

    auditAdmin(context, user.id, "PAGE_UPDATE", {
      resource: "pages",
      resourceId: id,
      metadata: { title: updated.title },
    });

    invalidateCache("page:");
    return updated;
  },
});

export const deletePage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["delete"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    const [archived] = await db
      .update(pages)
      .set({ deletedAt: new Date(), isPublished: false, updatedBy: user.id })
      .where(and(eq(pages.id, input.id), isNull(pages.deletedAt)))
      .returning({ id: pages.id, title: pages.title });

    if (!archived) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Page introuvable.",
      });
    }

    auditAdmin(context, user.id, "PAGE_DELETE", {
      resource: "pages",
      resourceId: input.id,
      metadata: { title: archived.title },
    });

    invalidateCache("page:");
    return { success: true as const };
  },
});

export const publishPage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    isPublished: z.boolean(),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["publish"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    const publishedAt = input.isPublished ? new Date() : null;

    const [updated] = await db
      .update(pages)
      .set({ isPublished: input.isPublished, publishedAt, scheduledAt: null, updatedBy: user.id })
      .where(eq(pages.id, input.id))
      .returning();

    if (!updated) {
      throw new ActionError({
        code: "NOT_FOUND",
        message: "Page introuvable.",
      });
    }

    // Auto-snapshot on publish
    if (input.isPublished) {
      try {
        const sections = await db
          .select()
          .from(pageSections)
          .where(eq(pageSections.pageId, input.id))
          .orderBy(asc(pageSections.sortOrder));

        const [latest] = await db
          .select({ versionNumber: pageVersions.versionNumber })
          .from(pageVersions)
          .where(eq(pageVersions.pageId, input.id))
          .orderBy(desc(pageVersions.versionNumber))
          .limit(1);

        const versionNumber = (latest?.versionNumber ?? 0) + 1;
        const { createdAt: _pc, updatedAt: _pu, ...pageData } = updated;
        const sectionSnapshots = sections.map(({ createdAt: _sc, updatedAt: _su, ...s }) => s);

        await db.insert(pageVersions).values({
          pageId: input.id,
          versionNumber,
          snapshot: { page: pageData, sections: sectionSnapshots },
          createdBy: user.id,
          note: `Auto-snapshot à la publication (v${versionNumber})`,
        });
      } catch (err: unknown) {
        console.error('[pages] Auto-snapshot on publish failed:', err);
      }
    }

    auditAdmin(context, user.id, "PAGE_PUBLISH", {
      resource: "pages",
      resourceId: input.id,
      metadata: { isPublished: input.isPublished },
    });

    invalidateCache("page:");
    return updated;
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Scheduled Publishing
// ═══════════════════════════════════════════════════════════════════════

export const schedulePage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    scheduledAt: z.string().refine(
      (val) => !isNaN(Date.parse(val)) && new Date(val).getTime() > Date.now() - 5000,
      "La date de publication programmée doit être dans le futur.",
    ),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["publish"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    const [updated] = await db
      .update(pages)
      .set({ scheduledAt: new Date(input.scheduledAt), isPublished: false, updatedBy: user.id })
      .where(and(eq(pages.id, input.id), isNull(pages.deletedAt)))
      .returning();

    if (!updated) {
      throw new ActionError({ code: "NOT_FOUND", message: "Page introuvable." });
    }

    auditAdmin(context, user.id, "PAGE_SCHEDULE", {
      resource: "pages",
      resourceId: input.id,
      metadata: { scheduledAt: input.scheduledAt },
    });

    invalidateCache("page:");
    return updated;
  },
});

export const unschedulePage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["publish"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    const [updated] = await db
      .update(pages)
      .set({ scheduledAt: null, updatedBy: user.id })
      .where(eq(pages.id, input.id))
      .returning();

    if (!updated) {
      throw new ActionError({ code: "NOT_FOUND", message: "Page introuvable." });
    }

    auditAdmin(context, user.id, "PAGE_UNSCHEDULE", {
      resource: "pages",
      resourceId: input.id,
    });

    invalidateCache("page:");
    return updated;
  },
});

export const scheduleUnpublishPage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    scheduledUnpublishAt: z.string().refine(
      (val) => !isNaN(Date.parse(val)) && new Date(val).getTime() > Date.now() - 5000,
      "La date de dépublication programmée doit être dans le futur.",
    ),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["publish"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    const [updated] = await db
      .update(pages)
      .set({ scheduledUnpublishAt: new Date(input.scheduledUnpublishAt), updatedBy: user.id })
      .where(and(eq(pages.id, input.id), isNull(pages.deletedAt)))
      .returning();

    if (!updated) {
      throw new ActionError({ code: "NOT_FOUND", message: "Page introuvable." });
    }

    auditAdmin(context, user.id, "PAGE_SCHEDULE_UNPUBLISH", {
      resource: "pages",
      resourceId: input.id,
      metadata: { scheduledUnpublishAt: input.scheduledUnpublishAt },
    });

    invalidateCache("page:");
    return updated;
  },
});

export const unscheduleUnpublishPage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["publish"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    const [updated] = await db
      .update(pages)
      .set({ scheduledUnpublishAt: null, updatedBy: user.id })
      .where(eq(pages.id, input.id))
      .returning();

    if (!updated) {
      throw new ActionError({ code: "NOT_FOUND", message: "Page introuvable." });
    }

    auditAdmin(context, user.id, "PAGE_UNSCHEDULE_UNPUBLISH", {
      resource: "pages",
      resourceId: input.id,
    });

    invalidateCache("page:");
    return updated;
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Trash / Restore
// ═══════════════════════════════════════════════════════════════════════

export const restoreFromTrash = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["update"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    const [restored] = await db
      .update(pages)
      .set({ deletedAt: null, updatedBy: user.id })
      .where(eq(pages.id, input.id))
      .returning({ id: pages.id, title: pages.title });

    if (!restored) {
      throw new ActionError({ code: "NOT_FOUND", message: "Page introuvable." });
    }

    auditAdmin(context, user.id, "PAGE_RESTORE", {
      resource: "pages",
      resourceId: input.id,
      metadata: { title: restored.title },
    });

    invalidateCache("page:");
    return { success: true as const };
  },
});

export const permanentlyDeletePage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["delete"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();

    // Only allow permanent deletion of already-trashed pages
    const [existing] = await db
      .select({ id: pages.id, title: pages.title, deletedAt: pages.deletedAt })
      .from(pages)
      .where(eq(pages.id, input.id))
      .limit(1);

    if (!existing) {
      throw new ActionError({ code: "NOT_FOUND", message: "Page introuvable." });
    }
    if (!existing.deletedAt) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Seules les pages dans la corbeille peuvent être supprimées définitivement. Archivez-la d'abord.",
      });
    }

    await db.delete(pages).where(eq(pages.id, input.id));

    auditAdmin(context, user.id, "PAGE_PERMANENT_DELETE", {
      resource: "pages",
      resourceId: input.id,
      metadata: { title: existing.title },
    });

    invalidateCache("page:");
    return { success: true as const };
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Bulk Operations
// ═══════════════════════════════════════════════════════════════════════

export const bulkPublishPages = defineAction({
  input: z.object({
    ids: z.array(z.string().min(1)).min(1, "Au moins une page est requise.").max(100, "Maximum 100 pages."),
    isPublished: z.boolean(),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["publish"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    const publishedAt = input.isPublished ? new Date() : null;

    const updated = await db
      .update(pages)
      .set({ isPublished: input.isPublished, publishedAt, updatedBy: user.id })
      .where(and(inArray(pages.id, input.ids), isNull(pages.deletedAt)))
      .returning({ id: pages.id });

    // Batch auto-snapshot on bulk publish (same behaviour as single publishPage)
    if (input.isPublished && updated.length > 0) {
      try {
        for (const { id: pageId } of updated) {
          const [page] = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
          if (!page) continue;

          const sections = await db
            .select()
            .from(pageSections)
            .where(eq(pageSections.pageId, pageId))
            .orderBy(asc(pageSections.sortOrder));

          const [latest] = await db
            .select({ versionNumber: pageVersions.versionNumber })
            .from(pageVersions)
            .where(eq(pageVersions.pageId, pageId))
            .orderBy(desc(pageVersions.versionNumber))
            .limit(1);

          const versionNumber = (latest?.versionNumber ?? 0) + 1;
          const { createdAt: _pc, updatedAt: _pu, ...pageData } = page;
          const sectionSnapshots = sections.map(({ createdAt: _sc, updatedAt: _su, ...s }) => s);

          await db.insert(pageVersions).values({
            pageId,
            versionNumber,
            snapshot: { page: pageData, sections: sectionSnapshots },
            createdBy: user.id,
            note: `Auto-snapshot à la publication groupée (v${versionNumber})`,
          });
        }
      } catch (err: unknown) {
        console.error('[pages] Bulk auto-snapshot failed for some pages:', err);
      }
    }

    auditAdmin(context, user.id, "PAGES_BULK_PUBLISH", {
      resource: "pages",
      metadata: { count: updated.length, isPublished: input.isPublished },
    });

    invalidateCache("page:");
    return { success: true as const, count: updated.length };
  },
});

export const bulkArchivePages = defineAction({
  input: z.object({
    ids: z.array(z.string().min(1)).min(1, "Au moins une page est requise.").max(100, "Maximum 100 pages."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["delete"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();

    const updated = await db
      .update(pages)
      .set({ deletedAt: new Date(), isPublished: false, updatedBy: user.id })
      .where(and(inArray(pages.id, input.ids), isNull(pages.deletedAt)))
      .returning({ id: pages.id });

    auditAdmin(context, user.id, "PAGES_BULK_ARCHIVE", {
      resource: "pages",
      metadata: { count: updated.length },
    });

    invalidateCache("page:");
    return { success: true as const, count: updated.length };
  },
});

export const bulkRestorePages = defineAction({
  input: z.object({
    ids: z.array(z.string().min(1)).min(1, "Au moins une page est requise.").max(100, "Maximum 100 pages."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["update"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    const restored = await db
      .update(pages)
      .set({ deletedAt: null, updatedBy: user.id })
      .where(and(inArray(pages.id, input.ids), isNotNull(pages.deletedAt)))
      .returning({ id: pages.id });

    auditAdmin(context, user.id, "PAGES_BULK_RESTORE", {
      resource: "pages",
      metadata: { count: restored.length },
    });

    invalidateCache("page:");
    return { success: true as const, count: restored.length };
  },
});

export const bulkDeletePages = defineAction({
  input: z.object({
    ids: z.array(z.string().min(1)).min(1, "Au moins une page est requise.").max(100, "Maximum 100 pages."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["delete"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    // Only allow permanent deletion of trashed pages
    const deleted = await db
      .delete(pages)
      .where(and(inArray(pages.id, input.ids), isNotNull(pages.deletedAt)))
      .returning({ id: pages.id });

    auditAdmin(context, user.id, "PAGES_BULK_DELETE", {
      resource: "pages",
      metadata: { count: deleted.length },
    });

    invalidateCache("page:");
    return { success: true as const, count: deleted.length };
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Clone / Templates
// ═══════════════════════════════════════════════════════════════════════

export const clonePage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant de la page source est requis."),
    slug: z
      .string()
      .trim()
      .min(1, "Le slug est requis.")
      .max(200, "Le slug ne peut pas dépasser 200 caractères.")
      .regex(slugRegex, "Le slug ne peut contenir que des lettres minuscules, chiffres et tirets."),
    title: z.string().trim().min(1, "Le titre est requis.").max(200, "Le titre ne peut pas dépasser 200 caractères."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["create"] });
    adminRateLimit(context, user.id, "pages");

    assertSlugNotReserved(input.slug);
    const db = getDrizzle();

    // Load source page
    const [source] = await db
      .select()
      .from(pages)
      .where(eq(pages.id, input.id))
      .limit(1);

    if (!source) {
      throw new ActionError({ code: "NOT_FOUND", message: "Page source introuvable." });
    }

    // Load source sections
    const sourceSections = await db
      .select()
      .from(pageSections)
      .where(eq(pageSections.pageId, input.id))
      .orderBy(asc(pageSections.sortOrder));

    // Create cloned page (always as draft)
    let cloned;
    try {
      [cloned] = await db
        .insert(pages)
        .values({
          locale: source.locale,
          slug: input.slug,
          title: input.title,
          metaTitle: source.metaTitle,
          metaDescription: source.metaDescription,
          ogImage: source.ogImage,
          canonical: null,
          robots: source.robots,
          template: source.template,
          isPublished: false,
          publishedAt: null,
          scheduledAt: null,
          scheduledUnpublishAt: null,
          sortOrder: source.sortOrder,
          updatedBy: user.id,
        })
        .returning();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        throw new ActionError({
          code: "CONFLICT",
          message: `Une page avec le slug « ${input.slug} » existe déjà pour la locale « ${source.locale} ».`,
        });
      }
      throw err;
    }

    // Clone sections
    if (sourceSections.length > 0) {
      await db.insert(pageSections).values(
        sourceSections.map((s) => ({
          pageId: cloned.id,
          type: s.type,
          content: s.content,
          sortOrder: s.sortOrder,
          isVisible: s.isVisible,
          updatedBy: user.id,
        })),
      );
    }

    auditAdmin(context, user.id, "PAGE_CLONE", {
      resource: "pages",
      resourceId: cloned.id,
      metadata: { sourceId: input.id, slug: input.slug },
    });

    invalidateCache("page:");
    return cloned;
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Content Locking
// ═══════════════════════════════════════════════════════════════════════

/** Lock expires after 5 minutes of inactivity. */
const LOCK_TTL_MS = 5 * 60 * 1000;

export const lockPage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["update"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();
    const now = new Date();

    // Check current lock status
    const [page] = await db
      .select({ lockedBy: pages.lockedBy, lockedAt: pages.lockedAt })
      .from(pages)
      .where(eq(pages.id, input.id))
      .limit(1);

    if (!page) {
      throw new ActionError({ code: "NOT_FOUND", message: "Page introuvable." });
    }

    // If locked by another user and lock is still fresh, reject
    if (page.lockedBy && page.lockedBy !== user.id && page.lockedAt) {
      const lockAge = now.getTime() - page.lockedAt.getTime();
      if (lockAge < LOCK_TTL_MS) {
        throw new ActionError({
          code: "CONFLICT",
          message: "Cette page est en cours de modification par un autre utilisateur.",
        });
      }
    }

    // Acquire or refresh lock
    await db
      .update(pages)
      .set({ lockedBy: user.id, lockedAt: now })
      .where(eq(pages.id, input.id));

    return { success: true as const, lockedBy: user.id, lockedAt: now.toISOString() };
  },
});

export const unlockPage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: async (input, context) => {
    await assertPermission(context, { page: ["update"] });
    const db = getDrizzle();

    // Only the lock owner (or any admin via force) can unlock
    await db
      .update(pages)
      .set({ lockedBy: null, lockedAt: null })
      .where(eq(pages.id, input.id));

    return { success: true as const };
  },
});

/** Helper: check if page is locked by another user. Throws on conflict. */
function assertNotLockedByOther(
  page: { lockedBy: string | null; lockedAt: Date | null },
  userId: string,
) {
  if (page.lockedBy && page.lockedBy !== userId && page.lockedAt) {
    const lockAge = Date.now() - page.lockedAt.getTime();
    if (lockAge < LOCK_TTL_MS) {
      throw new ActionError({
        code: "CONFLICT",
        message: "Cette page est verrouillée par un autre utilisateur.",
      });
    }
  }
}
