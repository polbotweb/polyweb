/**
 * Lectures publiques des forums (Effect, `dbTry`) : vue d'ensemble d'un site, liste paginée des
 * sujets (épinglés d'abord, filtres catégorie / étiquette, recherche plein texte Postgres sur
 * sujets ET réponses), détail d'un sujet (réponses paginées, votes, réactions, sondage, badges).
 * L'accès est TOUJOURS vérifié en amont (`services/access`) ; les fils privés n'apparaissent
 * qu'à leurs participants. Les DTO ne contiennent que du HTML déjà assaini (`body_html`).
 */
import { and, asc, desc, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { user } from "@database/schemas/auth.schema";
import { listBadges } from "@/core/badges";
import { dbTry } from "@/lib/effect/run";
import {
  forumCategories, forumPollBallots, forumPollOptions, forumPolls, forumPollVotes, forumPosts, forumReactions, forumTags, forumTopicFollows,
  forumTopicParticipants, forumTopics, forumTopicTags, forums, forumUserStats, forumVotes, type ForumPollResults, type ForumReaction,
} from "../schema";
import { categoryLabel } from "../domain/defaults";
import { pollClosed, pollResultsVisible, POSTS_PAGE_SIZE, TOPICS_PAGE_SIZE } from "../domain/rules";
import { forumById, type ForumAccess, type ForumViewer, type TopicAccess } from "../services/access";

export interface CategoryDTO { readonly id: string; readonly slug: string; readonly name: string; readonly description: string; readonly topics: number }
export interface ForumOverviewDTO { readonly id: string; readonly slug: string; readonly title: string; readonly description: string | null; readonly visibility: string; readonly status: string; readonly categories: CategoryDTO[] }

/** Sujet listable par ce lecteur : visible, et privé seulement s'il y participe. */
const listable = (viewer: ForumViewer): SQL => {
  const visible = eq(forumTopics.status, "visible");
  if (!viewer) return and(visible, eq(forumTopics.isPrivate, false))!;
  return and(visible, or(eq(forumTopics.isPrivate, false), exists(
    getDrizzle().select({ one: sql`1` }).from(forumTopicParticipants).where(and(eq(forumTopicParticipants.topicId, forumTopics.id), eq(forumTopicParticipants.userId, viewer.id))),
  )))!;
};

export const forumsOverview = (siteId: string, viewer: ForumViewer, locale: string) =>
  Effect.gen(function* () {
    const rows = yield* dbTry("forums.overview.forums", () => getDrizzle().select({ id: forums.id }).from(forums).where(eq(forums.siteId, siteId)).orderBy(asc(forums.position), asc(forums.title)));
    const accessible = (yield* Effect.forEach(rows, (r) => forumById(r.id, viewer).pipe(Effect.map((a) => a as ForumAccess | null), Effect.catchTag("ActionFailure", () => Effect.succeed(null))))).filter((a): a is ForumAccess => a !== null);
    const ids = accessible.map((a) => a.forum.id);
    const categories = ids.length === 0 ? [] : yield* dbTry("forums.overview.categories", () =>
      getDrizzle().select({
        id: forumCategories.id, forumId: forumCategories.forumId, slug: forumCategories.slug, translations: forumCategories.translations,
        topics: sql<number>`(select count(*)::int from ${forumTopics} where ${forumTopics.categoryId} = ${forumCategories.id} and ${listable(viewer)})`,
      }).from(forumCategories).where(inArray(forumCategories.forumId, ids)).orderBy(asc(forumCategories.position), asc(forumCategories.slug)),
    );
    return accessible.map(({ forum }): ForumOverviewDTO => ({
      id: forum.id, slug: forum.slug, title: forum.title, description: forum.description, visibility: forum.visibility, status: forum.status,
      categories: categories.filter((c) => c.forumId === forum.id).map((c) => ({ id: c.id, slug: c.slug, ...categoryLabel(c.translations, locale, c.slug), topics: Number(c.topics) })),
    }));
  });

export interface TopicListItem {
  readonly id: string; readonly title: string; readonly categoryId: string; readonly authorName: string | null; readonly isPrivate: boolean;
  readonly locked: boolean; readonly pinned: boolean; readonly score: number; readonly replyCount: number; readonly lastPostAt: Date; readonly createdAt: Date;
  readonly solved: boolean; readonly hasPoll: boolean; readonly tags: { slug: string; label: string }[];
}

export const listTopics = (input: { access: ForumAccess; viewer: ForumViewer; categoryId?: string | null; tagSlug?: string | null; q?: string | null; page: number }) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const conditions: SQL[] = [eq(forumTopics.forumId, input.access.forum.id), listable(input.viewer)];
    if (input.categoryId) conditions.push(eq(forumTopics.categoryId, input.categoryId));
    if (input.tagSlug) conditions.push(exists(db.select({ one: sql`1` }).from(forumTopicTags).innerJoin(forumTags, eq(forumTags.id, forumTopicTags.tagId)).where(and(eq(forumTopicTags.topicId, forumTopics.id), eq(forumTags.slug, input.tagSlug)))));
    const q = input.q?.trim().slice(0, 200);
    if (q) {
      const query = sql`websearch_to_tsquery('simple'::regconfig, ${q})`;
      conditions.push(or(sql`${forumTopics.searchVector} @@ ${query}`, exists(db.select({ one: sql`1` }).from(forumPosts).where(and(eq(forumPosts.topicId, forumTopics.id), eq(forumPosts.status, "visible"), sql`${forumPosts.searchVector} @@ ${query}`))))!);
    }
    const where = and(...conditions);
    const [rows, [total]] = yield* Effect.all([
      dbTry("forums.topics.list", () =>
        db.select({
          id: forumTopics.id, title: forumTopics.title, categoryId: forumTopics.categoryId, authorName: user.name, isPrivate: forumTopics.isPrivate, locked: forumTopics.locked,
          pinned: forumTopics.pinned, score: forumTopics.score, replyCount: forumTopics.replyCount, lastPostAt: forumTopics.lastPostAt, createdAt: forumTopics.createdAt,
          acceptedPostId: forumTopics.acceptedPostId, pollId: forumPolls.id,
        }).from(forumTopics).leftJoin(user, eq(user.id, forumTopics.authorId)).leftJoin(forumPolls, eq(forumPolls.topicId, forumTopics.id))
          .where(where).orderBy(desc(forumTopics.pinned), desc(forumTopics.lastPostAt), desc(forumTopics.id))
          .limit(TOPICS_PAGE_SIZE).offset((input.page - 1) * TOPICS_PAGE_SIZE),
      ),
      dbTry("forums.topics.count", () => db.select({ n: sql<number>`count(*)::int` }).from(forumTopics).where(where)),
    ]);
    const ids = rows.map((r) => r.id);
    const tags = ids.length === 0 ? [] : yield* dbTry("forums.topics.tags", () =>
      db.select({ topicId: forumTopicTags.topicId, slug: forumTags.slug, label: forumTags.label }).from(forumTopicTags).innerJoin(forumTags, eq(forumTags.id, forumTopicTags.tagId)).where(inArray(forumTopicTags.topicId, ids)),
    );
    const items = rows.map(({ acceptedPostId, pollId, ...r }): TopicListItem => ({ ...r, solved: acceptedPostId !== null, hasPoll: pollId !== null, tags: tags.filter((t) => t.topicId === r.id).map(({ slug, label }) => ({ slug, label })) }));
    return { items, total: Number(total?.n ?? 0), pageSize: TOPICS_PAGE_SIZE };
  });

export interface ReactionSummary { readonly reaction: ForumReaction; readonly count: number; readonly mine: boolean }
export interface PostDTO {
  readonly id: string; readonly authorId: string | null; readonly authorName: string | null; readonly bodyHtml: string; readonly score: number;
  readonly createdAt: Date; readonly myVote: number; readonly reactions: ReactionSummary[]; readonly accepted: boolean;
}
export interface PollDTO {
  readonly id: string; readonly question: string; readonly multiple: boolean; readonly resultsVisibility: ForumPollResults; readonly closesAt: Date | null;
  readonly closed: boolean; readonly voted: boolean; readonly showResults: boolean; readonly totalBallots: number;
  readonly options: { id: string; label: string; votes: number | null }[];
}
export interface AuthorDTO { readonly reputation: number; readonly badges: string[] }

const reactionsFor = (targetType: "topic" | "post", ids: readonly string[], viewerId: string | null) =>
  ids.length === 0 ? Effect.succeed([] as { targetId: string; reaction: ForumReaction; count: number; mine: boolean }[]) : dbTry("forums.reactions", () =>
    getDrizzle().select({
      targetId: forumReactions.targetId, reaction: forumReactions.reaction, count: sql<number>`count(*)::int`,
      mine: sql<boolean>`coalesce(bool_or(${forumReactions.userId} = ${viewerId ?? ""}), false)`,
    }).from(forumReactions).where(and(eq(forumReactions.targetType, targetType), inArray(forumReactions.targetId, [...ids]))).groupBy(forumReactions.targetId, forumReactions.reaction),
  );

const votesFor = (targetType: "topic" | "post", ids: readonly string[], viewerId: string | null) =>
  !viewerId || ids.length === 0 ? Effect.succeed([] as { targetId: string; value: number }[]) : dbTry("forums.myVotes", () =>
    getDrizzle().select({ targetId: forumVotes.targetId, value: forumVotes.value }).from(forumVotes).where(and(eq(forumVotes.targetType, targetType), inArray(forumVotes.targetId, [...ids]), eq(forumVotes.userId, viewerId))),
  );

const summarize = (rows: readonly { targetId: string; reaction: ForumReaction; count: number; mine: boolean }[], id: string): ReactionSummary[] =>
  rows.filter((r) => r.targetId === id).map((r) => ({ reaction: r.reaction, count: Number(r.count), mine: Boolean(r.mine) }));

export const topicDetail = (input: { access: TopicAccess; viewer: ForumViewer; page: number; locale: string }) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const { topic } = input.access;
    const viewerId = input.viewer?.id ?? null;
    const [[author], [category], tags, [total], posts] = yield* Effect.all([
      dbTry("forums.topic.author", () => db.select({ name: user.name }).from(user).where(eq(user.id, topic.authorId ?? "")).limit(1)),
      dbTry("forums.topic.category", () => db.select({ id: forumCategories.id, slug: forumCategories.slug, translations: forumCategories.translations }).from(forumCategories).where(eq(forumCategories.id, topic.categoryId)).limit(1)),
      dbTry("forums.topic.tags", () => db.select({ slug: forumTags.slug, label: forumTags.label }).from(forumTopicTags).innerJoin(forumTags, eq(forumTags.id, forumTopicTags.tagId)).where(eq(forumTopicTags.topicId, topic.id))),
      dbTry("forums.topic.postCount", () => db.select({ n: sql<number>`count(*)::int` }).from(forumPosts).where(and(eq(forumPosts.topicId, topic.id), eq(forumPosts.status, "visible")))),
      dbTry("forums.topic.posts", () =>
        db.select({ id: forumPosts.id, authorId: forumPosts.authorId, authorName: user.name, bodyHtml: forumPosts.bodyHtml, score: forumPosts.score, createdAt: forumPosts.createdAt })
          .from(forumPosts).leftJoin(user, eq(user.id, forumPosts.authorId)).where(and(eq(forumPosts.topicId, topic.id), eq(forumPosts.status, "visible")))
          .orderBy(asc(forumPosts.createdAt), asc(forumPosts.id)).limit(POSTS_PAGE_SIZE).offset((input.page - 1) * POSTS_PAGE_SIZE),
      ),
    ]);
    const postIds = posts.map((p) => p.id);
    const [postReactions, topicReactions, postVotes, topicVotes, follow] = yield* Effect.all([
      reactionsFor("post", postIds, viewerId), reactionsFor("topic", [topic.id], viewerId), votesFor("post", postIds, viewerId), votesFor("topic", [topic.id], viewerId),
      viewerId ? dbTry("forums.topic.follow", () => db.select({ userId: forumTopicFollows.userId }).from(forumTopicFollows).where(and(eq(forumTopicFollows.topicId, topic.id), eq(forumTopicFollows.userId, viewerId))).limit(1)) : Effect.succeed([]),
    ]);
    const authorIds = [...new Set([topic.authorId, ...posts.map((p) => p.authorId)].filter((id): id is string => Boolean(id)))];
    const [stats, badges] = yield* Effect.all([
      authorIds.length === 0 ? Effect.succeed([]) : dbTry("forums.topic.stats", () => db.select({ userId: forumUserStats.userId, reputation: forumUserStats.reputation }).from(forumUserStats).where(and(eq(forumUserStats.siteId, topic.siteId), inArray(forumUserStats.userId, authorIds)))),
      listBadges("forums", topic.siteId, authorIds),
    ]);
    const authors: Record<string, AuthorDTO> = Object.fromEntries(authorIds.map((id) => [id, { reputation: stats.find((s) => s.userId === id)?.reputation ?? 0, badges: badges.filter((b) => b.userId === id).map((b) => b.badge) }]));
    const poll = yield* pollFor(topic.id, viewerId);
    const participants = topic.isPrivate ? yield* dbTry("forums.topic.participants", () =>
      db.select({ id: user.id, name: user.name, username: user.username }).from(forumTopicParticipants).innerJoin(user, eq(user.id, forumTopicParticipants.userId)).where(eq(forumTopicParticipants.topicId, topic.id)).orderBy(asc(user.name)),
    ) : [];
    return {
      topic: {
        id: topic.id, forumId: topic.forumId, title: topic.title, bodyHtml: topic.bodyHtml, authorId: topic.authorId, authorName: author?.name ?? null, status: topic.status,
        isPrivate: topic.isPrivate, locked: topic.locked, pinned: topic.pinned, score: topic.score, createdAt: topic.createdAt, acceptedPostId: topic.acceptedPostId,
        myVote: topicVotes[0]?.value ?? 0, reactions: summarize(topicReactions, topic.id),
      },
      category: category ? { id: category.id, slug: category.slug, ...categoryLabel(category.translations, input.locale, category.slug) } : null,
      tags,
      posts: posts.map((p): PostDTO => ({ ...p, myVote: postVotes.find((v) => v.targetId === p.id)?.value ?? 0, reactions: summarize(postReactions, p.id), accepted: p.id === topic.acceptedPostId })),
      totalPosts: Number(total?.n ?? 0),
      pageSize: POSTS_PAGE_SIZE,
      authors,
      poll,
      participants,
      following: follow.length > 0,
    };
  });

export const pollFor = (topicId: string, viewerId: string | null) =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const [poll] = yield* dbTry("forums.poll.byTopic", () => db.select().from(forumPolls).where(eq(forumPolls.topicId, topicId)).limit(1));
    if (!poll) return null;
    const [options, ballots, mine] = yield* Effect.all([
      dbTry("forums.poll.results", () =>
        db.select({ id: forumPollOptions.id, label: forumPollOptions.label, votes: sql<number>`(select count(*)::int from ${forumPollVotes} where ${forumPollVotes.optionId} = ${forumPollOptions.id})` })
          .from(forumPollOptions).where(eq(forumPollOptions.pollId, poll.id)).orderBy(asc(forumPollOptions.position)),
      ),
      dbTry("forums.poll.ballots", () => db.select({ n: sql<number>`count(*)::int` }).from(forumPollBallots).where(eq(forumPollBallots.pollId, poll.id))),
      viewerId ? dbTry("forums.poll.mine", () => db.select({ userId: forumPollBallots.userId }).from(forumPollBallots).where(and(eq(forumPollBallots.pollId, poll.id), eq(forumPollBallots.userId, viewerId))).limit(1)) : Effect.succeed([]),
    ]);
    const closed = pollClosed(poll.closesAt);
    const voted = mine.length > 0;
    const showResults = pollResultsVisible({ mode: poll.resultsVisibility, voted, closed });
    return {
      id: poll.id, question: poll.question, multiple: poll.multiple, resultsVisibility: poll.resultsVisibility, closesAt: poll.closesAt, closed, voted, showResults,
      totalBallots: showResults ? Number(ballots[0]?.n ?? 0) : 0,
      options: options.map((o) => ({ id: o.id, label: o.label, votes: showResults ? Number(o.votes) : null })),
    } satisfies PollDTO;
  });
