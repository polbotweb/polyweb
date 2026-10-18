import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { eq, desc, asc } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { pages, pageSections, pageVersions } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { assertPermission, adminRateLimit, auditAdmin } from "./_helpers";
import { sanitizeSectionContent } from "./sections";

/**
 * Create a snapshot of the current state of a page + all its sections.
 * Called automatically on publish, or manually by the admin.
 */
export const createPageVersion = defineAction({
  input: z.object({
    pageId: z.string().min(1, "L'identifiant de la page est requis."),
    note: z
      .string()
      .trim()
      .max(500, "La note ne peut pas dépasser 500 caractères.")
      .nullable()
      .optional(),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["update"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();

    // Fetch page
    const [page] = await db
      .select()
      .from(pages)
      .where(eq(pages.id, input.pageId))
      .limit(1);
    if (!page) {
      throw new ActionError({ code: "NOT_FOUND", message: "Page introuvable." });
    }

    // Fetch sections
    const sections = await db
      .select()
      .from(pageSections)
      .where(eq(pageSections.pageId, input.pageId))
      .orderBy(asc(pageSections.sortOrder));

    // Determine next version number
    const [latest] = await db
      .select({ versionNumber: pageVersions.versionNumber })
      .from(pageVersions)
      .where(eq(pageVersions.pageId, input.pageId))
      .orderBy(desc(pageVersions.versionNumber))
      .limit(1);

    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    // Build snapshot — strip volatile timestamps
    const { createdAt: _pc, updatedAt: _pu, ...pageData } = page;
    const sectionSnapshots = sections.map(({ createdAt: _sc, updatedAt: _su, ...s }) => s);

    const snapshot = { page: pageData, sections: sectionSnapshots };

    const [created] = await db
      .insert(pageVersions)
      .values({
        pageId: input.pageId,
        versionNumber,
        snapshot,
        createdBy: user.id,
        note: input.note ?? null,
      })
      .returning();

    auditAdmin(context, user.id, "PAGE_VERSION_CREATE", {
      resource: "page_versions",
      resourceId: created.id,
      metadata: { pageId: input.pageId, versionNumber },
    });

    return created;
  },
});

/**
 * List all versions of a given page, most recent first.
 */
export const listPageVersions = defineAction({
  input: z.object({
    pageId: z.string().min(1, "L'identifiant de la page est requis."),
  }),
  handler: async (input, context) => {
    await assertPermission(context, { page: ["read"] });

    const db = getDrizzle();

    const versions = await db
      .select({
        id: pageVersions.id,
        versionNumber: pageVersions.versionNumber,
        createdBy: pageVersions.createdBy,
        note: pageVersions.note,
        createdAt: pageVersions.createdAt,
      })
      .from(pageVersions)
      .where(eq(pageVersions.pageId, input.pageId))
      .orderBy(desc(pageVersions.versionNumber))
      .limit(100);

    return versions;
  },
});

/**
 * Restore a page (and its sections) from a previously saved version.
 * Creates a new version snapshot before restoring so the current state is not lost.
 */
export const restorePageVersion = defineAction({
  input: z.object({
    versionId: z.string().min(1, "L'identifiant de la version est requis."),
  }),
  handler: async (input, context) => {
    const user = await assertPermission(context, { page: ["update"] });
    adminRateLimit(context, user.id, "pages");

    const db = getDrizzle();

    // Fetch the version to restore
    const [version] = await db
      .select()
      .from(pageVersions)
      .where(eq(pageVersions.id, input.versionId))
      .limit(1);

    if (!version) {
      throw new ActionError({ code: "NOT_FOUND", message: "Version introuvable." });
    }

    const snap = version.snapshot as Record<string, unknown>;

    // Validate snapshot shape before using it
    if (
      !snap ||
      typeof snap !== 'object' ||
      !snap.page ||
      typeof snap.page !== 'object' ||
      !Array.isArray(snap.sections)
    ) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: "Le snapshot de cette version est corrompu ou dans un format obsolète.",
      });
    }

    const snapshotPage = snap.page as Record<string, unknown>;
    const snapshotSections = snap.sections as Array<Record<string, unknown>>;

    const pageId = version.pageId;

    await db.transaction(async (tx) => {
      // 1. Snapshot current state before overwriting
      const [currentPage] = await tx
        .select()
        .from(pages)
        .where(eq(pages.id, pageId))
        .limit(1);

      if (!currentPage) {
        throw new ActionError({ code: "NOT_FOUND", message: "La page originale a été supprimée." });
      }

      const currentSections = await tx
        .select()
        .from(pageSections)
        .where(eq(pageSections.pageId, pageId))
        .orderBy(asc(pageSections.sortOrder));

      const [latestV] = await tx
        .select({ versionNumber: pageVersions.versionNumber })
        .from(pageVersions)
        .where(eq(pageVersions.pageId, pageId))
        .orderBy(desc(pageVersions.versionNumber))
        .limit(1);

      const preRestoreVersionNumber = (latestV?.versionNumber ?? 0) + 1;

      const { createdAt: _pc, updatedAt: _pu, ...currentPageData } = currentPage;
      const currentSectionSnapshots = currentSections.map(
        ({ createdAt: _sc, updatedAt: _su, ...s }) => s,
      );

      await tx.insert(pageVersions).values({
        pageId,
        versionNumber: preRestoreVersionNumber,
        snapshot: { page: currentPageData, sections: currentSectionSnapshots },
        createdBy: user.id,
        note: `Auto-snapshot avant restauration de la version ${version.versionNumber}`,
      });

      // 2. Restore page fields (except id, locale, createdAt, updatedAt)
      const { id: _id, locale: _locale, ...pageFields } = snapshotPage;
      await tx.update(pages).set(pageFields).where(eq(pages.id, pageId));

      // 3. Replace sections: delete all, then re-insert from snapshot
      await tx.delete(pageSections).where(eq(pageSections.pageId, pageId));

      if (snapshotSections.length > 0) {
        const sectionRows = snapshotSections.map((s) => {
          // Sanitize restored content (defense-in-depth: snapshot may pre-date sanitization)
          // Content may be a string (old snapshots) or object (jsonb)
          const content = sanitizeSectionContent(
            typeof s.content === 'string' ? s.content : s.content as Record<string, unknown>,
          );
          return {
            ...s,
            content,
            id: crypto.randomUUID(), // New IDs to avoid conflicts
            pageId,
          };
        });
        await tx.insert(pageSections).values(sectionRows as typeof pageSections.$inferInsert[]);
      }
    });

    auditAdmin(context, user.id, "PAGE_VERSION_RESTORE", {
      resource: "page_versions",
      resourceId: input.versionId,
      metadata: {
        pageId,
        restoredVersion: version.versionNumber,
      },
    });

    invalidateCache("page:");
    return { success: true, restoredVersion: version.versionNumber };
  },
});
