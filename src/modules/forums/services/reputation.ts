/**
 * Réputation et badges : recalcul EXACT depuis les sources (votes reçus sur les contenus visibles,
 * réponses acceptées, contributions) dans la transaction de l'écriture qui les modifie, puis
 * attribution idempotente des badges (core/badges) ; un badge nouveau émet un événement outbox.
 *
 * Concurrence : le recalcul d'un membre est sérialisé par un verrou consultatif transactionnel
 * (site, membre) pris AVANT l'agrégat ; en READ COMMITTED, l'agrégat (instruction suivante) voit
 * donc les écritures des transactions concurrentes déjà validées — pas de mise à jour perdue.
 * Ordre des verrous dans toutes les écritures : contenu (ligne) puis membres (triés).
 */
import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { awardBadges } from "@/core/badges";
import { recordEvent } from "@/core/events/outbox";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { forumBadges, type ForumMemberStats } from "../domain/badges";
import { FORUMS_BADGE_AWARDED_EVENT } from "../domain/events";
import { reputationOf } from "../domain/rules";

type Row = { topics: number; posts: number; accepted: number; upvotes: number; downvotes: number };

export const recomputeMemberStats = (tx: DbTransaction, input: { siteId: string; userId: string | null; organizationId: string | null }) =>
  Effect.gen(function* () {
    if (!input.userId) return null;
    const { siteId, userId } = input;
    yield* dbTry("forums.stats.lock", () => tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`forums:stats:${siteId}:${userId}`}, 0))`));
    const result = yield* dbTry("forums.stats.aggregate", () =>
      tx.execute(sql`
        with own_topics as (select id from forum_topics where site_id = ${siteId} and author_id = ${userId} and status = 'visible'),
             own_posts as (select id from forum_posts where site_id = ${siteId} and author_id = ${userId} and status = 'visible'),
             votes as (
               select v.value from forum_votes v where v.target_type = 'topic' and v.target_id in (select id from own_topics)
               union all
               select v.value from forum_votes v where v.target_type = 'post' and v.target_id in (select id from own_posts)
             )
        select (select count(*) from own_topics)::int as topics,
               (select count(*) from own_posts)::int as posts,
               (select count(*) from forum_topics t where t.site_id = ${siteId} and t.accepted_post_id in (select id from own_posts))::int as accepted,
               (select count(*) from votes where value > 0)::int as upvotes,
               (select count(*) from votes where value < 0)::int as downvotes`),
    );
    const row = ((result as unknown as { rows: Row[] }).rows[0] ?? { topics: 0, posts: 0, accepted: 0, upvotes: 0, downvotes: 0 }) as Row;
    const stats: ForumMemberStats = {
      topics: Number(row.topics), posts: Number(row.posts), acceptedAnswers: Number(row.accepted), upvotesReceived: Number(row.upvotes),
      reputation: reputationOf({ upvotes: Number(row.upvotes), downvotes: Number(row.downvotes), accepted: Number(row.accepted) }),
    };
    yield* dbTry("forums.stats.upsert", () =>
      tx.execute(sql`
        insert into forum_user_stats (site_id, user_id, reputation, topics, posts, accepted_answers, upvotes_received, updated_at)
        values (${siteId}, ${userId}, ${stats.reputation}, ${stats.topics}, ${stats.posts}, ${stats.acceptedAnswers}, ${stats.upvotesReceived}, now())
        on conflict (site_id, user_id) do update set reputation = excluded.reputation, topics = excluded.topics, posts = excluded.posts,
          accepted_answers = excluded.accepted_answers, upvotes_received = excluded.upvotes_received, updated_at = now()`),
    );
    const awarded = yield* awardBadges(tx, forumBadges, { scopeId: siteId, userId, stats });
    for (const badge of awarded) yield* recordEvent(tx, FORUMS_BADGE_AWARDED_EVENT, { siteId, userId, badge }, { organizationId: input.organizationId });
    return { stats, awarded };
  });

/**
 * Verrou de ligne sur la cible d'un vote, pris en DÉBUT de transaction (avant l'écriture du vote) :
 * les votes concurrents sur une même cible sont sérialisés, chaque recalcul voit les précédents.
 */
export const lockVoteTarget = (tx: DbTransaction, targetType: "topic" | "post", targetId: string) =>
  dbTry("forums.vote.lock", () =>
    targetType === "topic"
      ? tx.execute(sql`select id from forum_topics where id = ${targetId} for update`)
      : tx.execute(sql`select id from forum_posts where id = ${targetId} for update`),
  );

/** Score d'une cible = somme des votes (recalcul exact, sans dérive). */
export const recomputeScore = (tx: DbTransaction, targetType: "topic" | "post", targetId: string) =>
  dbTry("forums.score", () =>
    targetType === "topic"
      ? tx.execute(sql`update forum_topics set score = coalesce((select sum(value) from forum_votes where target_type = 'topic' and target_id = ${targetId}), 0) where id = ${targetId}`)
      : tx.execute(sql`update forum_posts set score = coalesce((select sum(value) from forum_votes where target_type = 'post' and target_id = ${targetId}), 0) where id = ${targetId}`),
  );
