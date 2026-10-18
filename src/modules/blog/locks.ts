/**
 * Verrou d'édition des articles : déclaration auprès du verrou générique
 * `src/core/locks` (politique utilisateur + session, reprise par soi, TTL, purge).
 * `tenantOf` fournit l'organisation propriétaire pour la libération administrative.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { blogPostLocks, blogPosts } from "@database/schemas";
import { BLOG_DEFAULTS } from "@/lib/blog/constants";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";

export const blogPostLock = defineLockResource("blog-post", drizzleLockStore("blog-post", blogPostLocks, "postId"), {
  ttlMs: BLOG_DEFAULTS.lockDurationMinutes * 60 * 1000,
  tenantOf: (id) =>
    dbTry("blog.lockTenant", () => getDrizzle().select({ organizationId: blogPosts.organizationId }).from(blogPosts).where(eq(blogPosts.id, id)).limit(1)).pipe(
      Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined)),
    ),
});
