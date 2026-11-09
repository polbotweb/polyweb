import { and, count, eq, isNull, or } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { blogComments, blogPostReviews, blogPosts, moderationReports } from "@database/schemas";
import type { DbError } from "@/lib/effect/errors";
import { dbTry, runOrThrow } from "@/lib/effect/run";

function postTenantScope(organizationId: string | null) {
  return organizationId === null ? isNull(blogPosts.organizationId) : eq(blogPosts.organizationId, organizationId);
}

/** Total des éléments à modérer du tenant (commentaires, avis, signalements ouverts de `moderation_reports`) : 3 comptes parallèles. */
const blogAdminModerationCountEffect = (organizationId: string | null): Effect.Effect<number, DbError> =>
  Effect.suspend(() => {
    const db = getDrizzle();
    const scope = postTenantScope(organizationId);
    return Effect.all(
      [
        dbTry("blogAdmin.pendingComments", () =>
          db.select({ count: count() }).from(blogComments).innerJoin(blogPosts, eq(blogPosts.id, blogComments.postId)).where(and(scope, or(eq(blogComments.status, "PENDING"), eq(blogComments.status, "SPAM")))),
        ),
        dbTry("blogAdmin.pendingReviews", () =>
          db.select({ count: count() }).from(blogPostReviews).innerJoin(blogPosts, eq(blogPosts.id, blogPostReviews.postId)).where(and(scope, eq(blogPostReviews.status, "PENDING"))),
        ),
        dbTry("blogAdmin.openReports", () =>
          db.select({ count: count() }).from(moderationReports).where(and(eq(moderationReports.module, "blog"), eq(moderationReports.status, "open"), organizationId === null ? isNull(moderationReports.organizationId) : eq(moderationReports.organizationId, organizationId))),
        ),
      ],
      { concurrency: "unbounded" },
    ).pipe(Effect.map((groups) => groups.reduce((sum, rows) => sum + Number(rows[0]?.count ?? 0), 0)));
  });

export const blogAdminModerationEffects = { getBlogAdminModerationCount: blogAdminModerationCountEffect };

export const getBlogAdminModerationCount = (organizationId: string | null): Promise<number> =>
  runOrThrow(blogAdminModerationCountEffect(organizationId));
