import { and, asc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { blogPostLinks, blogPosts, blogPostSeo, blogPostTranslations } from "@database/schemas";
import type { Locale } from "@i18n/config";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { blogLoaderEffects } from "./blog.loader";

/** Données de l'éditeur : article admin + SEO et liens de la locale (lectures parallèles). */
const blogPostEditorDataEffect = (postId: string, locale: Locale) =>
  Effect.gen(function* () {
    const base = yield* blogLoaderEffects.getBlogPostForAdmin(postId);
    if (!base) return null;
    const db = getDrizzle();
    const [seoRows, links] = yield* Effect.all(
      [
        dbTry("blogAdmin.editorSeo", () =>
          db.select().from(blogPostSeo).where(and(eq(blogPostSeo.postId, postId), eq(blogPostSeo.locale, locale))).limit(1),
        ),
        dbTry("blogAdmin.editorLinks", () =>
          db
            .select({
              id: blogPostLinks.id,
              linkType: blogPostLinks.linkType,
              sortOrder: blogPostLinks.sortOrder,
              targetId: blogPosts.id,
              targetSlug: blogPostTranslations.slug,
              targetTitle: blogPostTranslations.title,
            })
            .from(blogPostLinks)
            .innerJoin(blogPosts, eq(blogPostLinks.targetPostId, blogPosts.id))
            .leftJoin(blogPostTranslations, and(eq(blogPostTranslations.postId, blogPosts.id), eq(blogPostTranslations.locale, locale)))
            .where(eq(blogPostLinks.sourcePostId, postId))
            .orderBy(asc(blogPostLinks.sortOrder), asc(blogPostLinks.linkType)),
        ),
      ],
      { concurrency: "unbounded" },
    );
    return {
      ...base,
      seo: seoRows[0] ?? null,
      links: links.map((link) => ({
        id: link.id,
        linkType: link.linkType,
        sortOrder: link.sortOrder,
        target: { id: link.targetId, slug: link.targetSlug ?? "", title: link.targetTitle ?? null },
      })),
    };
  });

export const blogAdminEditorEffects = { getBlogPostEditorData: blogPostEditorDataEffect };

export const getBlogPostEditorData = (postId: string, locale: Locale) => runOrThrow(blogPostEditorDataEffect(postId, locale));
