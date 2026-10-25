import { Effect } from "effect";
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, and, asc, desc, isNull, isNotNull, inArray, max } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { pages, pageSections, pageVersions } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { auditAdmin } from "./_helpers";
import { LOCALES } from "@i18n/config";
import { ActionFailure, actionRateLimit, actionTry, effectHandler, fail, requireActionPermission } from "@/lib/effect/action";
import { BulkActionError, runBulkAction } from "@/core/bulk";
import type { ActionAPIContext } from "astro:actions";
import type { AuditAction } from "@/lib/audit";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { pageLock, PAGE_LOCK_TTL_MS } from "@/lib/pages/locks";

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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["create"] });
    yield* actionRateLimit(user.id, "pages");
    return yield* actionTry("admin/pages.createPage", async () => {

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
    });
  })),
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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["update"] });
    yield* actionRateLimit(user.id, "pages");
    // Verrou générique (src/core/locks) : refus si un autre propriétaire (utilisateur + session) détient la page.
    yield* pageLock.ensureNotLockedByOther(input.id, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    return yield* actionTry("admin/pages.updatePage", async () => {

    const { id, expectedUpdatedAt, ...data } = input;
    if (data.slug) assertSlugNotReserved(data.slug);

    const db = getDrizzle();

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
    });
  })),
});

export const deletePage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["delete"] });
    yield* actionRateLimit(user.id, "pages");
    return yield* actionTry("admin/pages.deletePage", async () => {

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
    });
  })),
});

export const publishPage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    isPublished: z.boolean(),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["publish"] });
    yield* actionRateLimit(user.id, "pages");
    return yield* actionTry("admin/pages.publishPage", async () => {

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
    });
  })),
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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["publish"] });
    yield* actionRateLimit(user.id, "pages");
    return yield* actionTry("admin/pages.schedulePage", async () => {

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
    });
  })),
});

export const unschedulePage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["publish"] });
    yield* actionRateLimit(user.id, "pages");
    return yield* actionTry("admin/pages.unschedulePage", async () => {

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
    });
  })),
});

export const scheduleUnpublishPage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    scheduledUnpublishAt: z.string().refine(
      (val) => !isNaN(Date.parse(val)) && new Date(val).getTime() > Date.now() - 5000,
      "La date de dépublication programmée doit être dans le futur.",
    ),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["publish"] });
    yield* actionRateLimit(user.id, "pages");
    return yield* actionTry("admin/pages.scheduleUnpublishPage", async () => {

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
    });
  })),
});

export const unscheduleUnpublishPage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["publish"] });
    yield* actionRateLimit(user.id, "pages");
    return yield* actionTry("admin/pages.unscheduleUnpublishPage", async () => {

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
    });
  })),
});

// ═══════════════════════════════════════════════════════════════════════
// Trash / Restore
// ═══════════════════════════════════════════════════════════════════════

export const restoreFromTrash = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["update"] });
    yield* actionRateLimit(user.id, "pages");
    return yield* actionTry("admin/pages.restoreFromTrash", async () => {

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
    });
  })),
});

export const permanentlyDeletePage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["delete"] });
    yield* actionRateLimit(user.id, "pages");
    return yield* actionTry("admin/pages.permanentlyDeletePage", async () => {

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
    });
  })),
});

// ═══════════════════════════════════════════════════════════════════════
// Bulk Operations
// ═══════════════════════════════════════════════════════════════════════

type PageRow = typeof pages.$inferSelect;
type PagesDb = ReturnType<typeof getDrizzle>;
type PagesTx = Parameters<Parameters<PagesDb["transaction"]>[0]>[0];
type PageBulkOperation = "publish" | "unpublish" | "archive" | "restore" | "delete";
const bulkIdsSchema = z.array(z.string().min(1)).min(1, "Au moins une page est requise.").max(100, "Maximum 100 pages.");

/** Erreur du moteur core/bulk → erreur d'action (mêmes codes). */
const bulkToAction = <A, E>(effect: Effect.Effect<A, E | BulkActionError>): Effect.Effect<A, E | ActionFailure> =>
  effect.pipe(Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)));

/** Instantané de version d'une page (même contenu que la publication unitaire), dans la transaction. */
async function snapshotPage(tx: PagesTx, page: PageRow, userId: string) {
  const sections = await tx.select().from(pageSections).where(eq(pageSections.pageId, page.id)).orderBy(asc(pageSections.sortOrder));
  const [latest] = await tx.select({ versionNumber: pageVersions.versionNumber }).from(pageVersions).where(eq(pageVersions.pageId, page.id)).orderBy(desc(pageVersions.versionNumber)).limit(1);
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const { createdAt: _pc, updatedAt: _pu, ...pageData } = page;
  const sectionSnapshots = sections.map(({ createdAt: _sc, updatedAt: _su, ...section }) => section);
  await tx.insert(pageVersions).values({ pageId: page.id, versionNumber, snapshot: { page: pageData, sections: sectionSnapshots }, createdBy: userId, note: `Auto-snapshot à la publication groupée (v${versionNumber})` });
}

const notTrashed = (row: PageRow) => (row.deletedAt ? `La page « ${row.title} » est dans la corbeille.` : null);
const trashed = (row: PageRow) => (row.deletedAt ? null : `La page « ${row.title} » n'est pas dans la corbeille.`);

/**
 * Actions groupées des pages sur le moteur générique core/bulk : tout ou rien (une page dans un
 * état incompatible fait échouer l'ensemble, sans écriture), verrous d'édition respectés,
 * une transaction, audit par page (batchId commun), cache invalidé après validation.
 */
const pageBulkOperations = {
  publish: { validate: notTrashed, auditAction: "PAGES_BULK_PUBLISH", apply: async (tx: PagesTx, row: PageRow, actor: { id: string }) => {
    await tx.update(pages).set({ isPublished: true, publishedAt: new Date(), updatedBy: actor.id }).where(eq(pages.id, row.id));
    await snapshotPage(tx, row, actor.id);
  }, auditMetadata: () => ({ isPublished: true }) },
  unpublish: { validate: notTrashed, auditAction: "PAGES_BULK_PUBLISH", apply: async (tx: PagesTx, row: PageRow, actor: { id: string }) => {
    await tx.update(pages).set({ isPublished: false, publishedAt: null, updatedBy: actor.id }).where(eq(pages.id, row.id));
  }, auditMetadata: () => ({ isPublished: false }) },
  archive: { validate: notTrashed, auditAction: "PAGES_BULK_ARCHIVE", confirmationKey: "pages.bulk.archive", apply: async (tx: PagesTx, row: PageRow, actor: { id: string }) => {
    await tx.update(pages).set({ deletedAt: new Date(), isPublished: false, updatedBy: actor.id }).where(eq(pages.id, row.id));
  } },
  restore: { validate: trashed, auditAction: "PAGES_BULK_RESTORE", apply: async (tx: PagesTx, row: PageRow, actor: { id: string }) => {
    await tx.update(pages).set({ deletedAt: null, updatedBy: actor.id }).where(eq(pages.id, row.id));
  } },
  // Suppression définitive : uniquement depuis la corbeille.
  delete: { validate: trashed, auditAction: "PAGES_BULK_DELETE", destructive: true, apply: async (tx: PagesTx, row: PageRow) => {
    await tx.delete(pages).where(eq(pages.id, row.id));
  } },
} as const;

const PAGE_BULK_PERMISSION: Record<PageBulkOperation, "publish" | "update" | "delete"> = { publish: "publish", unpublish: "publish", archive: "delete", restore: "update", delete: "delete" };

function runPageBulk(context: ActionAPIContext, operation: PageBulkOperation, ids: readonly string[]) {
  const db = getDrizzle();
  return bulkToAction(runBulkAction({
    resource: "pages",
    operations: pageBulkOperations,
    authorize: (op: PageBulkOperation) => Effect.gen(function* () {
      const user = yield* requireActionPermission(context, { page: [PAGE_BULK_PERMISSION[op]] });
      yield* actionRateLimit(user.id, "pages");
      return { id: user.id };
    }),
    load: (selected) => actionTry(`admin/pages.bulk.${operation}.load`, () => db.select().from(pages).where(inArray(pages.id, [...selected]))),
    guard: (selected, actor) => pageLock.ensureNoneLockedByOther(selected, lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
    transaction: (body) => db.transaction((tx) => body(tx)),
    audit: (actor, action, entry) => auditAdmin(context, actor.id, action as AuditAction, entry),
    afterCommit: () => invalidateCache("page:"),
  }, { ids, operation })).pipe(Effect.map((r) => ({ success: true as const, count: r.updated, batchId: r.batchId })));
}

/** Point d'entrée unique pour la barre générique AdminBulkBar ({ ids, operation }). */
export const PAGE_BULK_OPERATIONS = ["publish", "unpublish", "archive", "restore", "delete"] as const;
export const bulkPageLifecycle = defineAction({
  input: z.object({ ids: bulkIdsSchema, operation: z.enum(PAGE_BULK_OPERATIONS), organizationId: z.string().nullable().optional() }),
  handler: effectHandler((input, context) => runPageBulk(context, input.operation, input.ids).pipe(Effect.map((r) => ({ ...r, updated: r.count })))),
});

export const bulkPublishPages = defineAction({
  input: z.object({ ids: bulkIdsSchema, isPublished: z.boolean() }),
  handler: effectHandler((input, context) => runPageBulk(context, input.isPublished ? "publish" : "unpublish", input.ids)),
});

export const bulkArchivePages = defineAction({
  input: z.object({ ids: bulkIdsSchema }),
  handler: effectHandler((input, context) => runPageBulk(context, "archive", input.ids)),
});

export const bulkRestorePages = defineAction({
  input: z.object({ ids: bulkIdsSchema }),
  handler: effectHandler((input, context) => runPageBulk(context, "restore", input.ids)),
});

export const bulkDeletePages = defineAction({
  input: z.object({ ids: bulkIdsSchema }),
  handler: effectHandler((input, context) => runPageBulk(context, "delete", input.ids)),
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
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["create"] });
    yield* actionRateLimit(user.id, "pages");
    return yield* actionTry("admin/pages.clonePage", async () => {

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
    });
  })),
});

// ═══════════════════════════════════════════════════════════════════════
// Content Locking
// ═══════════════════════════════════════════════════════════════════════

export const lockPage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
    takeOver: z.boolean().optional(),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["update"] });
    yield* actionRateLimit(user.id, "pages");
    const [page] = yield* actionTry("admin/pages.lockPage.load", () => getDrizzle().select({ id: pages.id }).from(pages).where(eq(pages.id, input.id)).limit(1));
    if (!page) return yield* fail("NOT_FOUND", "Page introuvable.");
    const sessionId = context.locals.session?.id;
    // Verrou générique (src/core/locks) : même utilisateur dans une autre session → confirmation
    // « reprendre ici ? » puis reprise auditée ; un autre utilisateur reste bloqué (CONFLICT).
    const outcome = yield* pageLock.acquire(input.id, lockOwnerFrom(user.id, sessionId), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) }).pipe(
      Effect.map((acquired) => ({ ok: true as const, ...acquired })),
      Effect.catchTag("LockHeldError", (error) => (error.sameUser ? Effect.succeed({ ok: false as const, takeOverPrompt: error.message }) : Effect.fail(error))),
    );
    if (!outcome.ok) return { success: false as const, takeOverPrompt: outcome.takeOverPrompt };
    if (outcome.tookOverFrom !== null) auditAdmin(context, user.id, "PAGE_LOCK_TAKEOVER", { resource: "page", resourceId: input.id, metadata: { previousSessionId: outcome.tookOverFrom } });
    const lockedAt = new Date(outcome.expiresAt.getTime() - PAGE_LOCK_TTL_MS);
    return { success: true as const, lockedBy: user.id, lockedAt: lockedAt.toISOString(), expiresAt: outcome.expiresAt.toISOString() };
  })),
});

export const unlockPage = defineAction({
  input: z.object({
    id: z.string().min(1, "L'identifiant est requis."),
  }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const user = yield* requireActionPermission(context, { page: ["update"] });
    // Seul le propriétaire (utilisateur + session) libère ; libération d'un autre : forceReleaseLock (admin, auditée).
    yield* pageLock.release(input.id, lockOwnerFrom(user.id, context.locals.session?.id));
    return { success: true as const };
  })),
});
