import { eq, and, asc, or, lte, isNull } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { cached } from "@database/cache";
import { pages, pageSections } from "@database/schemas";
import { isValidLocale } from "@i18n/utils";
import type { DbError } from "@/lib/effect/errors";
import { dbTry, runOrThrow } from "@/lib/effect/run";

export interface PageWithSections {
  page: typeof pages.$inferSelect;
  sections: (typeof pageSections.$inferSelect)[];
}

/*
 * Lectures de pages CMS Effect-natives (`dbTry` : DbError typé, span `db.page.<op>`).
 * Les exports Promise historiques restent des adaptateurs `runOrThrow` (mis en cache
 * pour getPage / getPagesList, mêmes clés) : les appelants ne changent pas.
 */
const publishedOrDue = (now: Date) => or(eq(pages.isPublished, true), lte(pages.scheduledAt, now));

const sectionsOf = (pageId: string, visibleOnly: boolean) =>
  dbTry("page.sections", () =>
    getDrizzle()
      .select()
      .from(pageSections)
      .where(visibleOnly ? and(eq(pageSections.pageId, pageId), eq(pageSections.isVisible, true)) : eq(pageSections.pageId, pageId))
      .orderBy(asc(pageSections.sortOrder))
      .limit(200),
  );

/**
 * Persiste l'état publié d'une page servie par publication programmée (cohérence de l'admin).
 * Non bloquant : un échec est journalisé et n'empêche pas l'affichage de la page.
 */
const persistScheduledPublish = (page: typeof pages.$inferSelect, now: Date): Effect.Effect<void> =>
  !page.isPublished && page.scheduledAt && page.scheduledAt <= now
    ? dbTry("page.lazyPublish", () =>
        getDrizzle()
          .update(pages)
          .set({ isPublished: true, publishedAt: page.scheduledAt, scheduledAt: null })
          .where(eq(pages.id, page.id)),
      ).pipe(
        Effect.asVoid,
        Effect.catch((err) =>
          Effect.sync(() => console.error("[page.loader] Lazy-update for scheduled publish failed:", err.cause)),
        ),
      )
    : Effect.void;

/** Page publiée (ou dont la publication programmée est échue) avec ses sections visibles. */
const pageEffect = (locale: string, slug: string): Effect.Effect<PageWithSections | null, DbError> =>
  !isValidLocale(locale)
    ? Effect.succeed(null)
    : Effect.gen(function* () {
        const now = new Date();
        const [page] = yield* dbTry("page.bySlug", () =>
          getDrizzle()
            .select()
            .from(pages)
            .where(and(eq(pages.locale, locale), eq(pages.slug, slug), isNull(pages.deletedAt), publishedOrDue(now)))
            .limit(1),
        );
        if (!page) return null;
        yield* persistScheduledPublish(page, now);
        const sections = yield* sectionsOf(page.id, true);
        return { page, sections };
      });

/** Pages publiées d'une locale (sitemap, navigation…). */
const pagesListEffect = (locale: string) =>
  !isValidLocale(locale)
    ? Effect.succeed([])
    : Effect.suspend(() => {
        const now = new Date();
        return dbTry("page.list", () =>
          getDrizzle()
            .select({
              id: pages.id,
              slug: pages.slug,
              title: pages.title,
              sortOrder: pages.sortOrder,
              publishedAt: pages.publishedAt,
            })
            .from(pages)
            .where(and(eq(pages.locale, locale), isNull(pages.deletedAt), publishedOrDue(now)))
            .orderBy(asc(pages.sortOrder))
            .limit(500),
        );
      });

/** Page par id (brouillon ou publiée) avec toutes ses sections, pour l'aperçu admin. */
const pagePreviewEffect = (pageId: string): Effect.Effect<PageWithSections | null, DbError> =>
  Effect.gen(function* () {
    const [page] = yield* dbTry("page.preview", () => getDrizzle().select().from(pages).where(eq(pages.id, pageId)).limit(1));
    if (!page) return null;
    const sections = yield* sectionsOf(page.id, false);
    return { page, sections };
  });

/** Lectures Effect-natives. getPagePreview n'est pas mis en cache ; les deux autres le sont côté Promise. */
export const pageLoaderEffects = {
  getPage: pageEffect,
  getPagesList: pagesListEffect,
  getPagePreview: pagePreviewEffect,
};

/** Load a published CMS page by locale and slug, including its visible sections. */
export const getPage = cached(
  (locale: string, slug: string) => `page:${locale}:${slug}`,
  (locale: string, slug: string): Promise<PageWithSections | null> => runOrThrow(pageEffect(locale, slug)),
);

/** List all published CMS pages for a locale (for sitemap, nav, etc.). */
export const getPagesList = cached(
  (locale: string) => `page:list:${locale}`,
  (locale: string) => runOrThrow(pagesListEffect(locale)),
);

/** Load a CMS page by ID (draft or published) for admin preview. NOT cached — always returns fresh data. */
export const getPagePreview = (pageId: string): Promise<PageWithSections | null> => runOrThrow(pagePreviewEffect(pageId));
