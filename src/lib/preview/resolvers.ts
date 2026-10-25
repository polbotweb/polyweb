/**
 * Registre applicatif des aperçus sécurisés de brouillons (core/preview) : type de
 * ressource → résolveur. Ajouter un type = un résolveur ici + son rendu dans
 * `src/pages/[lang]/preview/draft/[token].astro`.
 */
import { Effect } from "effect";
import type { DraftPreviewResolver } from "@/core/preview";
import { pageLoaderEffects, type PageWithSections } from "@database/loaders/page.loader";
import type { DbError } from "@/lib/effect/errors";

export type DraftPreviewData = { readonly kind: "page"; readonly page: PageWithSections };

/** Pages CMS : état courant (brouillon compris), hors corbeille. */
const pagePreviewResolver: DraftPreviewResolver<DraftPreviewData, DbError> = {
  kind: "page",
  permission: { page: ["update"] },
  load: (id) =>
    pageLoaderEffects.getPagePreview(id).pipe(
      Effect.map((page) => (page && !page.page.deletedAt ? { kind: "page" as const, page } : null)),
    ),
};

export const DRAFT_PREVIEW_RESOLVERS: ReadonlyMap<string, DraftPreviewResolver<DraftPreviewData, DbError>> = new Map([
  [pagePreviewResolver.kind, pagePreviewResolver],
]);

export const DRAFT_PREVIEW_KINDS = [...DRAFT_PREVIEW_RESOLVERS.keys()] as [string, ...string[]];
