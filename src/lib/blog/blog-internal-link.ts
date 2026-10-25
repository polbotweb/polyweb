import type { Locale } from "@i18n/config";
import { getDrizzle } from "@database/drizzle";
import { eq, and, ilike } from "drizzle-orm";
import { blogPosts, blogPostTranslations } from "@database/schemas";
import { getBlogPostBySlug, getBlogValidLinkTargets } from "@database/loaders/blog.loader";
import { buildBlogPostUrl } from "@/lib/blog/utils";
import { orgScope, publishedScope } from "@database/loaders/blog.loader";
import type { InternalLinkResolver, InternalLinkResolution } from "@/lib/content/internal-link-resolver";
import { Effect } from "effect";
import type { DbError } from "@/lib/effect/errors";
import { dbTry, runOrThrow } from "@/lib/effect/run";

interface Ctx {
  locale: string;
  organizationId?: string | null;
  limit?: number;
}

/**
 * Blog internal-link resolver — implémentation Effect (`DbError` typé, spans).
 * Le contrat `InternalLinkResolver` du registre de contenu reste Promise (ouvert
 * aux modules) : `blogInternalLinkResolver` n'est qu'un adaptateur `runOrThrow`
 * qui relève la cause d'origine, comme avant la migration.
 */
export const blogInternalLinkEffects = {
  resolve: (target: string, ctx: Ctx): Effect.Effect<InternalLinkResolution, DbError> =>
    Effect.gen(function* () {
      const locale = ctx.locale as Locale;
      const orgId = ctx.organizationId ?? null;
      const post = yield* dbTry("blog-link.resolve", () => getBlogPostBySlug(orgId, locale, target));
      if (!post || !post.translation) return { href: "#", title: null, exists: false };
      const categorySlug = post.categories[0]?.slug ?? null;
      const href = buildBlogPostUrl(locale, orgId, post.translation.slug, categorySlug);
      return { href, title: post.translation.title, exists: true };
    }),

  listValidTargets: (ctx: Ctx): Effect.Effect<Set<string>, DbError> =>
    dbTry("blog-link.listValidTargets", () => getBlogValidLinkTargets(ctx.organizationId ?? null, ctx.locale as Locale)),

  search: (query: string, ctx: Ctx) =>
    Effect.gen(function* () {
      const orgId = ctx.organizationId ?? null;
      const locale = ctx.locale as Locale;
      const limit = Math.min(20, Math.max(1, ctx.limit ?? 10));
      const q = `%${query}%`;
      const rows = yield* dbTry("blog-link.search", () =>
        getDrizzle()
          .select({
            id: blogPosts.id,
            slug: blogPostTranslations.slug,
            title: blogPostTranslations.title,
          })
          .from(blogPostTranslations)
          .innerJoin(blogPosts, eq(blogPosts.id, blogPostTranslations.postId))
          .where(
            and(
              eq(blogPostTranslations.locale, locale),
              orgScope(blogPosts, orgId),
              publishedScope(blogPosts),
              ilike(blogPostTranslations.title, q),
            ),
          )
          .limit(limit),
      );
      // search results don't carry category; resolve() is used for exact href
      return rows.map((r) => ({ id: r.id, label: r.title, href: buildBlogPostUrl(locale, orgId, r.slug, null) }));
    }),
};

/** Adaptateur Promise enregistré dans le registre de contenu (contrat inchangé). */
export const blogInternalLinkResolver: InternalLinkResolver = {
  name: "blog",
  resolve: (target: string, ctx: Ctx) => runOrThrow(blogInternalLinkEffects.resolve(target, ctx)),
  listValidTargets: (ctx: Ctx) => runOrThrow(blogInternalLinkEffects.listValidTargets(ctx)),
  search: (query: string, ctx: Ctx) => runOrThrow(blogInternalLinkEffects.search(query, ctx)),
};
