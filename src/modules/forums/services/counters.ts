import { sql, type SQL } from "drizzle-orm";

/** Nombre exact de réponses visibles d'un sujet (sous-requête, pour `UPDATE … SET`). */
export const visibleReplyCount = (topicId: string): SQL<number> =>
  sql<number>`(select count(*)::int from forum_posts where topic_id = ${topicId} and status = 'visible')`;
