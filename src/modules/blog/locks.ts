/**
 * Verrou d'édition des articles : déclaration auprès du verrou générique
 * `src/core/locks` (politique utilisateur + session, reprise par soi, TTL, purge).
 */
import { blogPostLocks } from "@database/schemas";
import { BLOG_DEFAULTS } from "@/lib/blog/constants";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";

export const blogPostLock = defineLockResource("blog-post", drizzleLockStore("blog-post", blogPostLocks, "postId"), {
  ttlMs: BLOG_DEFAULTS.lockDurationMinutes * 60 * 1000,
});
