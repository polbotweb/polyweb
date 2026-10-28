import { Effect } from "effect";
import { and, lte, eq, isNull, isNotNull, lt } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { pages } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { apiRoute } from "@/lib/effect/http";
import { isCronAuthorized } from "@/lib/effect/cron";
import { attempt, legacyJson } from "@/lib/effect/route";
import { logAuditEventEffect } from "@/lib/audit";
import { fecExportService } from "@/modules/sales/services/fecExport.service";

export const prerender = false;

/**
 * POST /api/cron/publish
 *
 * Quatre tâches planifiées, chacune isolée (l'échec de l'une n'empêche pas les autres) :
 * 1. publication des pages dont scheduledAt <= now
 * 2. dépublication des pages dont scheduledUnpublishAt <= now
 * 3. purge des pages en corbeille depuis plus de 30 jours
 * 4. exports FEC du mois précédent par tenant (sales, lot borné ; échecs relancés après 1 h)
 */
export const POST = apiRoute(({ request }) =>
  Effect.gen(function* () {
    if (!isCronAuthorized(request, process.env)) return legacyJson({ error: "Unauthorized" }, 401);

    const now = new Date();
    const db = getDrizzle();
    const count = (operation: string, run: () => Promise<Array<{ id: string }>>) =>
      attempt(operation, run).pipe(
        Effect.map((rows) => rows.length),
        Effect.catch((error) => Effect.logError(`[cron/publish] ${operation} failed`, error.cause).pipe(Effect.as(0))),
      );

    const published = yield* count("auto-publish", () =>
      db
        .update(pages)
        .set({ isPublished: true, publishedAt: now, scheduledAt: null })
        .where(and(isNotNull(pages.scheduledAt), lte(pages.scheduledAt, now), eq(pages.isPublished, false), isNull(pages.deletedAt)))
        .returning({ id: pages.id }),
    );
    const unpublished = yield* count("auto-unpublish", () =>
      db
        .update(pages)
        .set({ isPublished: false, scheduledUnpublishAt: null })
        .where(and(isNotNull(pages.scheduledUnpublishAt), lte(pages.scheduledUnpublishAt, now), eq(pages.isPublished, true), isNull(pages.deletedAt)))
        .returning({ id: pages.id }),
    );
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const purged = yield* count("trash-purge", () =>
      db.delete(pages).where(and(isNotNull(pages.deletedAt), lt(pages.deletedAt, thirtyDaysAgo))).returning({ id: pages.id }),
    );

    const fec = yield* fecExportService.runMonthly(now).pipe(
      Effect.tap((counts) => counts.ready + counts.failed > 0
        ? logAuditEventEffect({ action: "SALES_FEC_GENERATE", resource: "sales_fec_export", metadata: { source: "cron", ...counts } })
        : Effect.void),
      Effect.catchCause((cause) => Effect.logError("[cron/publish] fec-exports failed", cause).pipe(Effect.as(null))),
    );

    if (published > 0 || unpublished > 0 || purged > 0) invalidateCache("page:");
    return legacyJson({ ok: true, published, unpublished, purged, fec }, 200, { "Cache-Control": "no-store" });
  }),
);
