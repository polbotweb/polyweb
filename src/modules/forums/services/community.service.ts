/**
 * Participation aux forums (écritures) : sujets, réponses, votes, réactions, réponse acceptée,
 * suivi, sondages, fils privés, outils de modération (verrouiller, épingler, déplacer).
 *
 * Chaque écriture : lecteur autorisé à VOIR la cible (sinon NOT_FOUND indiscernable), sanctions
 * actives, limite de débit, validation, puis UNE transaction (données + réputation/badges +
 * événements outbox). Les charges utiles d'événements ne contiennent jamais de contenu.
 * Fils privés : invitations soumises aux préférences et blocages de la messagerie
 * (`assertCanMessage`) ; tout refus est rendu comme NOT_FOUND.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { user } from "@database/schemas/auth.schema";
import { renderMarkdown, extractMentions } from "@/core/content/markdown";
import { recordEvent } from "@/core/events/outbox";
import { assertCanMessage } from "@/core/messaging/service";
import { cleanModerationText } from "@/core/moderation/service";
import { dbTry } from "@/lib/effect/run";
import { fail } from "@/lib/effect/failure";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import {
  forumCategories, forumPollBallots, forumPollOptions, forumPolls, forumPollVotes, forumPosts, forumReactions, forumTags, forumTopicFollows,
  forumTopicParticipants, forumTopics, forumTopicTags, forums, forumVotes, type ForumPollResults, type ForumReaction,
} from "../schema";
import {
  BODY_MAX, BODY_MIN, MAX_PRIVATE_PARTICIPANTS, MAX_TAGS_PER_TOPIC, NOTE_MAX, NOTE_MIN, POLL_OPTIONS_MAX, POLL_OPTIONS_MIN,
  pollClosed, TOPIC_TITLE_MAX, TOPIC_TITLE_MIN, validBallot,
} from "../domain/rules";
import { FORUMS_MENTIONED_EVENT, FORUMS_POST_CREATED_EVENT } from "../domain/events";
import { forumById, forumRateLimit, forumsCan, isOrgMember, notFound, requireParticipant, topicAccess, type ForumViewer, type TopicAccess } from "./access";
import { recomputeMemberStats, recomputeScore } from "./reputation";
import { forumsAudit } from "./audit";
import { visibleReplyCount } from "./counters";

const cleanTitle = (value: string) => value.replace(/\s+/g, " ").trim();
const cleanBody = (value: string) => value.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();

const validateText = (title: string | null, body: string) =>
  Effect.gen(function* () {
    if (title !== null && (title.length < TOPIC_TITLE_MIN || title.length > TOPIC_TITLE_MAX)) return yield* fail("BAD_REQUEST", `Titre : entre ${TOPIC_TITLE_MIN} et ${TOPIC_TITLE_MAX} caractères.`);
    if (body.length < BODY_MIN || body.length > BODY_MAX) return yield* fail("BAD_REQUEST", `Message : entre ${BODY_MIN} et ${BODY_MAX} caractères.`);
  });

/** Pseudos → identifiants (insensible à la casse), hors auteur. */
const usersByUsername = (names: readonly string[], exclude: string) =>
  names.length === 0
    ? Effect.succeed([] as { id: string }[])
    : dbTry("forums.users.byUsername", () =>
        getDrizzle().select({ id: user.id }).from(user).where(inArray(sql`lower(${user.username})`, names.map((n) => n.toLowerCase()))),
      ).pipe(Effect.map((rows) => rows.filter((r) => r.id !== exclude)));

const recordMentions = (tx: DbTransaction, input: { body: string; authorId: string; siteId: string; organizationId: string | null; topicId: string; targetType: "topic" | "post"; targetId: string }) =>
  Effect.gen(function* () {
    const mentioned = yield* usersByUsername(extractMentions(input.body), input.authorId);
    if (mentioned.length === 0) return;
    yield* recordEvent(tx, FORUMS_MENTIONED_EVENT, { siteId: input.siteId, topicId: input.topicId, targetType: input.targetType, targetId: input.targetId, authorId: input.authorId, userIds: mentioned.map((m) => m.id) }, { organizationId: input.organizationId });
  });

/** Invité acceptable : préférences + blocages messagerie, et accès au forum (organisation). */
const assertInvitable = (inviterId: string, inviteeId: string, forum: { visibility: string; organizationId: string | null }) =>
  Effect.gen(function* () {
    yield* assertCanMessage(inviterId, inviteeId).pipe(Effect.catchTag("MessagingUnavailableError", () => notFound()));
    if (forum.visibility === "org" && forum.organizationId && !(yield* isOrgMember({ id: inviteeId }, forum.organizationId))) return yield* notFound();
  });

export interface PollInput {
  readonly question: string;
  readonly options: readonly string[];
  readonly multiple: boolean;
  readonly resultsVisibility: ForumPollResults;
  readonly closesAt: Date | null;
}

export interface CreateTopicInput {
  readonly forumId: string;
  readonly categoryId: string;
  readonly title: string;
  readonly body: string;
  readonly tagIds?: readonly string[];
  /** Fil privé : pseudos des personnes invitées (l'auteur est toujours participant). */
  readonly privateWith?: readonly string[] | null;
  readonly poll?: PollInput | null;
}

const validatePoll = (poll: PollInput) =>
  Effect.gen(function* () {
    const question = cleanTitle(poll.question);
    const options = [...new Set(poll.options.map(cleanTitle).filter(Boolean))];
    if (question.length < 3 || question.length > 200) return yield* fail("BAD_REQUEST", "Question du sondage : entre 3 et 200 caractères.");
    if (options.length < POLL_OPTIONS_MIN || options.length > POLL_OPTIONS_MAX || options.some((o) => o.length > 120)) return yield* fail("BAD_REQUEST", `Sondage : entre ${POLL_OPTIONS_MIN} et ${POLL_OPTIONS_MAX} options distinctes (120 caractères max).`);
    if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) return yield* fail("BAD_REQUEST", "La date de clôture du sondage doit être dans le futur.");
    return { question, options };
  });

export const createTopic = (input: CreateTopicInput, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const { forum } = yield* forumById(input.forumId, viewer);
    const actor = yield* requireParticipant(viewer, forum.siteId, "post");
    yield* forumRateLimit(actor.id, "topic");
    const title = cleanTitle(input.title);
    const body = cleanBody(input.body);
    yield* validateText(title, body);
    const [category] = yield* dbTry("forums.topic.category", () =>
      getDrizzle().select({ id: forumCategories.id }).from(forumCategories).where(and(eq(forumCategories.id, input.categoryId), eq(forumCategories.forumId, forum.id))).limit(1),
    );
    if (!category) return yield* fail("BAD_REQUEST", "Catégorie invalide.");
    const tagIds = [...new Set(input.tagIds ?? [])];
    if (tagIds.length > MAX_TAGS_PER_TOPIC) return yield* fail("BAD_REQUEST", `${MAX_TAGS_PER_TOPIC} étiquettes au maximum.`);
    const tags = tagIds.length === 0 ? [] : yield* dbTry("forums.topic.tags", () => getDrizzle().select({ id: forumTags.id }).from(forumTags).where(and(eq(forumTags.siteId, forum.siteId), inArray(forumTags.id, tagIds))));
    if (tags.length !== tagIds.length) return yield* fail("BAD_REQUEST", "Étiquette invalide.");
    const poll = input.poll ? yield* validatePoll(input.poll) : null;
    const isPrivate = input.privateWith !== undefined && input.privateWith !== null;
    let invitees: string[] = [];
    if (isPrivate) {
      const names = [...new Set((input.privateWith ?? []).map((n) => n.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))];
      if (names.length === 0 || names.length > MAX_PRIVATE_PARTICIPANTS) return yield* fail("BAD_REQUEST", `Fil privé : entre 1 et ${MAX_PRIVATE_PARTICIPANTS} participants.`);
      const found = yield* usersByUsername(names, actor.id);
      if (found.length !== names.length) return yield* notFound();
      for (const invitee of found) yield* assertInvitable(actor.id, invitee.id, forum);
      invitees = found.map((f) => f.id);
    }
    return yield* dbTransaction("forums.topic.create", (tx) =>
      Effect.gen(function* () {
        const [topic] = yield* dbTry("forums.topic.insert", () =>
          tx.insert(forumTopics).values({ forumId: forum.id, categoryId: category.id, siteId: forum.siteId, organizationId: forum.organizationId, authorId: actor.id, title, body, bodyHtml: renderMarkdown(body), isPrivate })
            .returning({ id: forumTopics.id }),
        );
        if (tags.length) yield* dbTry("forums.topic.tags.insert", () => tx.insert(forumTopicTags).values(tags.map((t) => ({ topicId: topic.id, tagId: t.id }))));
        const followers = [actor.id, ...invitees];
        if (isPrivate) yield* dbTry("forums.topic.participants", () => tx.insert(forumTopicParticipants).values(followers.map((userId) => ({ topicId: topic.id, userId, invitedBy: userId === actor.id ? null : actor.id }))));
        yield* dbTry("forums.topic.follow", () => tx.insert(forumTopicFollows).values(followers.map((userId) => ({ topicId: topic.id, userId }))).onConflictDoNothing());
        if (poll) {
          const [created] = yield* dbTry("forums.poll.insert", () =>
            tx.insert(forumPolls).values({ topicId: topic.id, question: poll.question, multiple: input.poll!.multiple, resultsVisibility: input.poll!.resultsVisibility, closesAt: input.poll!.closesAt }).returning({ id: forumPolls.id }),
          );
          yield* dbTry("forums.poll.options", () => tx.insert(forumPollOptions).values(poll.options.map((label, position) => ({ pollId: created.id, label, position }))));
        }
        yield* recomputeMemberStats(tx, { siteId: forum.siteId, userId: actor.id, organizationId: forum.organizationId });
        yield* recordMentions(tx, { body, authorId: actor.id, siteId: forum.siteId, organizationId: forum.organizationId, topicId: topic.id, targetType: "topic", targetId: topic.id });
        return { id: topic.id };
      }),
    );
  }).pipe(Effect.withSpan("forums.topic.create"));

/** Lecteur connecté qui VOIT le sujet ; verrouillé : gestionnaires seulement. */
const writableTopic = (topicId: string, viewer: ForumViewer, activity: "post" | "interact") =>
  Effect.gen(function* () {
    const access = yield* topicAccess(topicId, viewer);
    const actor = yield* requireParticipant(viewer, access.topic.siteId, activity);
    if (access.topic.status !== "visible") return yield* notFound();
    return { access, actor };
  });

export const createReply = (input: { topicId: string; body: string }, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const { access, actor } = yield* writableTopic(input.topicId, viewer, "post");
    if (access.topic.locked && !access.manager) return yield* fail("FORBIDDEN", "Ce sujet est verrouillé.");
    yield* forumRateLimit(actor.id, "reply");
    const body = cleanBody(input.body);
    yield* validateText(null, body);
    const topic = access.topic;
    return yield* dbTransaction("forums.reply.create", (tx) =>
      Effect.gen(function* () {
        const [post] = yield* dbTry("forums.reply.insert", () =>
          tx.insert(forumPosts).values({ topicId: topic.id, siteId: topic.siteId, organizationId: topic.organizationId, authorId: actor.id, body, bodyHtml: renderMarkdown(body) }).returning({ id: forumPosts.id, createdAt: forumPosts.createdAt }),
        );
        yield* dbTry("forums.reply.topic", () => tx.update(forumTopics).set({ replyCount: visibleReplyCount(topic.id), lastPostAt: post.createdAt }).where(eq(forumTopics.id, topic.id)));
        yield* dbTry("forums.reply.follow", () => tx.insert(forumTopicFollows).values({ topicId: topic.id, userId: actor.id }).onConflictDoNothing());
        yield* recomputeMemberStats(tx, { siteId: topic.siteId, userId: actor.id, organizationId: topic.organizationId });
        yield* recordEvent(tx, FORUMS_POST_CREATED_EVENT, { siteId: topic.siteId, topicId: topic.id, postId: post.id, authorId: actor.id }, { organizationId: topic.organizationId });
        yield* recordMentions(tx, { body, authorId: actor.id, siteId: topic.siteId, organizationId: topic.organizationId, topicId: topic.id, targetType: "post", targetId: post.id });
        return { id: post.id, topicId: topic.id };
      }),
    );
  }).pipe(Effect.withSpan("forums.reply.create"));

/** Cible votable / réagissable : sujet ou réponse VISIBLE d'un sujet visible par le lecteur. */
const engagementTarget = (targetType: "topic" | "post", targetId: string, viewer: ForumViewer) =>
  Effect.gen(function* () {
    if (targetType === "topic") {
      const { access, actor } = yield* writableTopic(targetId, viewer, "interact");
      return { access, actor, authorId: access.topic.authorId };
    }
    const [post] = yield* dbTry("forums.target.post", () => getDrizzle().select({ topicId: forumPosts.topicId, authorId: forumPosts.authorId, status: forumPosts.status }).from(forumPosts).where(eq(forumPosts.id, targetId)).limit(1));
    if (!post || post.status !== "visible") return yield* notFound();
    const { access, actor } = yield* writableTopic(post.topicId, viewer, "interact");
    return { access, actor, authorId: post.authorId };
  });

export const vote = (input: { targetType: "topic" | "post"; targetId: string; value: -1 | 0 | 1 }, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const { access, actor, authorId } = yield* engagementTarget(input.targetType, input.targetId, viewer);
    if (authorId === actor.id) return yield* fail("FORBIDDEN", "Vous ne pouvez pas voter pour votre propre contenu.");
    yield* forumRateLimit(actor.id, "vote");
    return yield* dbTransaction("forums.vote", (tx) =>
      Effect.gen(function* () {
        const key = and(eq(forumVotes.targetType, input.targetType), eq(forumVotes.targetId, input.targetId), eq(forumVotes.userId, actor.id));
        if (input.value === 0) yield* dbTry("forums.vote.delete", () => tx.delete(forumVotes).where(key));
        else yield* dbTry("forums.vote.upsert", () =>
          tx.insert(forumVotes).values({ targetType: input.targetType, targetId: input.targetId, userId: actor.id, value: input.value })
            .onConflictDoUpdate({ target: [forumVotes.targetType, forumVotes.targetId, forumVotes.userId], set: { value: input.value, createdAt: new Date() } }),
        );
        yield* recomputeScore(tx, input.targetType, input.targetId);
        yield* recomputeMemberStats(tx, { siteId: access.topic.siteId, userId: authorId, organizationId: access.topic.organizationId });
        const [{ score }] = yield* dbTry("forums.vote.score", () => tx.select({ score: sql<number>`coalesce(sum(${forumVotes.value}), 0)::int` }).from(forumVotes).where(and(eq(forumVotes.targetType, input.targetType), eq(forumVotes.targetId, input.targetId))));
        return { score, value: input.value };
      }),
    );
  });

export const toggleReaction = (input: { targetType: "topic" | "post"; targetId: string; reaction: ForumReaction }, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const { actor } = yield* engagementTarget(input.targetType, input.targetId, viewer);
    yield* forumRateLimit(actor.id, "reaction");
    const key = and(eq(forumReactions.targetType, input.targetType), eq(forumReactions.targetId, input.targetId), eq(forumReactions.userId, actor.id), eq(forumReactions.reaction, input.reaction));
    const removed = yield* dbTry("forums.reaction.delete", () => getDrizzle().delete(forumReactions).where(key).returning({ reaction: forumReactions.reaction }));
    if (removed.length > 0) return { active: false };
    yield* dbTry("forums.reaction.insert", () => getDrizzle().insert(forumReactions).values({ targetType: input.targetType, targetId: input.targetId, userId: actor.id, reaction: input.reaction }).onConflictDoNothing());
    return { active: true };
  });

/** Réponse acceptée : auteur du sujet ou gestionnaire ; `postId = null` retire l'acceptation. */
export const acceptAnswer = (input: { topicId: string; postId: string | null }, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const { access, actor } = yield* writableTopic(input.topicId, viewer, "interact");
    const topic = access.topic;
    if (topic.authorId !== actor.id && !access.manager) return yield* fail("FORBIDDEN", "Seul l'auteur du sujet peut accepter une réponse.");
    const post = input.postId === null ? null : (yield* dbTry("forums.accept.post", () =>
      getDrizzle().select({ id: forumPosts.id, authorId: forumPosts.authorId }).from(forumPosts).where(and(eq(forumPosts.id, input.postId!), eq(forumPosts.topicId, topic.id), eq(forumPosts.status, "visible"))).limit(1),
    ))[0];
    if (input.postId !== null && !post) return yield* notFound();
    return yield* dbTransaction("forums.accept", (tx) =>
      Effect.gen(function* () {
        const [previous] = topic.acceptedPostId ? yield* dbTry("forums.accept.previous", () => tx.select({ authorId: forumPosts.authorId }).from(forumPosts).where(eq(forumPosts.id, topic.acceptedPostId!)).limit(1)) : [];
        yield* dbTry("forums.accept.set", () => tx.update(forumTopics).set({ acceptedPostId: post?.id ?? null }).where(eq(forumTopics.id, topic.id)));
        for (const authorId of new Set([previous?.authorId ?? null, post?.authorId ?? null])) yield* recomputeMemberStats(tx, { siteId: topic.siteId, userId: authorId, organizationId: topic.organizationId });
        if (topic.authorId !== actor.id) yield* forumsAudit(tx, { actorId: actor.id, action: "forums.topic.accept", resource: "forums.topic", resourceId: topic.id, organizationId: topic.organizationId, siteId: topic.siteId, metadata: { postId: post?.id ?? null, previous: topic.acceptedPostId } });
        return { acceptedPostId: post?.id ?? null };
      }),
    );
  });

export const setFollow = (input: { topicId: string; follow: boolean }, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const access = yield* topicAccess(input.topicId, viewer);
    if (!viewer) return yield* fail("UNAUTHORIZED", "Vous devez être connecté pour effectuer cette action.");
    yield* forumRateLimit(viewer.id, "follow");
    if (input.follow) yield* dbTry("forums.follow.add", () => getDrizzle().insert(forumTopicFollows).values({ topicId: access.topic.id, userId: viewer.id }).onConflictDoNothing());
    else yield* dbTry("forums.follow.remove", () => getDrizzle().delete(forumTopicFollows).where(and(eq(forumTopicFollows.topicId, access.topic.id), eq(forumTopicFollows.userId, viewer.id))));
    return { following: input.follow };
  });

export const votePoll = (input: { pollId: string; optionIds: readonly string[] }, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const [poll] = yield* dbTry("forums.poll.get", () => getDrizzle().select().from(forumPolls).where(eq(forumPolls.id, input.pollId)).limit(1));
    if (!poll) return yield* notFound();
    const { actor } = yield* writableTopic(poll.topicId, viewer, "interact");
    yield* forumRateLimit(actor.id, "poll");
    if (pollClosed(poll.closesAt)) return yield* fail("BAD_REQUEST", "Ce sondage est clos.");
    const options = yield* dbTry("forums.poll.options", () => getDrizzle().select({ id: forumPollOptions.id }).from(forumPollOptions).where(eq(forumPollOptions.pollId, poll.id)));
    if (!validBallot({ multiple: poll.multiple, optionIds: input.optionIds, pollOptionIds: options.map((o) => o.id) })) return yield* fail("BAD_REQUEST", poll.multiple ? "Choisissez au moins une option." : "Choisissez une seule option.");
    return yield* dbTransaction("forums.poll.vote", (tx) =>
      Effect.gen(function* () {
        const ballot = yield* dbTry("forums.poll.ballot", () => tx.insert(forumPollBallots).values({ pollId: poll.id, userId: actor.id }).onConflictDoNothing().returning({ pollId: forumPollBallots.pollId }));
        if (ballot.length === 0) return yield* fail("CONFLICT", "Vous avez déjà voté à ce sondage.");
        yield* dbTry("forums.poll.votes", () => tx.insert(forumPollVotes).values([...new Set(input.optionIds)].map((optionId) => ({ pollId: poll.id, optionId, userId: actor.id }))));
        return { voted: true as const };
      }),
    );
  });

/** Invitation dans un fil privé : participant seulement ; refus (préférences, blocage, inconnu) → NOT_FOUND. */
export const inviteParticipant = (input: { topicId: string; username: string }, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const { access, actor } = yield* writableTopic(input.topicId, viewer, "interact");
    if (!access.topic.isPrivate || !access.participant) return yield* notFound();
    yield* forumRateLimit(actor.id, "invite");
    const [count] = yield* dbTry("forums.invite.count", () => getDrizzle().select({ n: sql<number>`count(*)::int` }).from(forumTopicParticipants).where(eq(forumTopicParticipants.topicId, access.topic.id)));
    if ((count?.n ?? 0) >= MAX_PRIVATE_PARTICIPANTS + 1) return yield* fail("BAD_REQUEST", "Nombre maximal de participants atteint.");
    const [invitee] = yield* usersByUsername([input.username.trim().replace(/^@/, "")], actor.id);
    if (!invitee) return yield* notFound();
    yield* assertInvitable(actor.id, invitee.id, access.forum);
    yield* dbTry("forums.invite.insert", () => getDrizzle().insert(forumTopicParticipants).values({ topicId: access.topic.id, userId: invitee.id, invitedBy: actor.id }).onConflictDoNothing());
    yield* dbTry("forums.invite.follow", () => getDrizzle().insert(forumTopicFollows).values({ topicId: access.topic.id, userId: invitee.id }).onConflictDoNothing());
    return { invited: true as const };
  });

export const leavePrivateTopic = (input: { topicId: string }, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const access = yield* topicAccess(input.topicId, viewer);
    if (!viewer || !access.topic.isPrivate || !access.participant) return yield* notFound();
    yield* dbTry("forums.leave", () => getDrizzle().delete(forumTopicParticipants).where(and(eq(forumTopicParticipants.topicId, access.topic.id), eq(forumTopicParticipants.userId, viewer.id))));
    yield* dbTry("forums.leave.unfollow", () => getDrizzle().delete(forumTopicFollows).where(and(eq(forumTopicFollows.topicId, access.topic.id), eq(forumTopicFollows.userId, viewer.id))));
    return { left: true as const };
  });

export const FORUM_TOPIC_TOOLS = ["lock", "unlock", "pin", "unpin", "move"] as const;
export type ForumTopicTool = (typeof FORUM_TOPIC_TOOLS)[number];

/** Outils de modération d'un sujet : motif obligatoire, audit dans la transaction. */
export const moderateTopic = (input: { topicId: string; tool: ForumTopicTool; note: string; categoryId?: string | null }, viewer: ForumViewer) =>
  Effect.gen(function* () {
    const access: TopicAccess = yield* topicAccess(input.topicId, viewer);
    if (!viewer || !access.manager) return yield* notFound();
    const note = cleanModerationText(input.note, NOTE_MAX);
    if (!note || note.length < NOTE_MIN) return yield* fail("BAD_REQUEST", "Motif obligatoire (3 caractères minimum).");
    const topic = access.topic;
    let patch: Partial<typeof forumTopics.$inferInsert> = {};
    let metadata: Record<string, unknown> = { note };
    if (input.tool === "lock" || input.tool === "unlock") { patch = { locked: input.tool === "lock" }; metadata = { ...metadata, from: topic.locked, to: patch.locked }; }
    if (input.tool === "pin" || input.tool === "unpin") { patch = { pinned: input.tool === "pin" }; metadata = { ...metadata, from: topic.pinned, to: patch.pinned }; }
    if (input.tool === "move") {
      const [target] = input.categoryId ? yield* dbTry("forums.move.target", () =>
        getDrizzle().select({ id: forumCategories.id, forumId: forums.id, organizationId: forums.organizationId }).from(forumCategories).innerJoin(forums, eq(forums.id, forumCategories.forumId))
          .where(and(eq(forumCategories.id, input.categoryId!), eq(forums.siteId, topic.siteId))).limit(1),
      ) : [];
      if (!target) return yield* fail("BAD_REQUEST", "Catégorie de destination invalide.");
      if (target.forumId !== topic.forumId && !(yield* forumsCan(viewer, { organizationId: target.organizationId, siteId: topic.siteId }, ["moderate"]))) return yield* fail("BAD_REQUEST", "Catégorie de destination invalide.");
      patch = { categoryId: target.id, forumId: target.forumId, organizationId: target.organizationId };
      metadata = { ...metadata, from: { forumId: topic.forumId, categoryId: topic.categoryId }, to: { forumId: target.forumId, categoryId: target.id } };
    }
    return yield* dbTransaction("forums.topic.moderate", (tx) =>
      Effect.gen(function* () {
        yield* dbTry("forums.topic.moderate.set", () => tx.update(forumTopics).set(patch).where(eq(forumTopics.id, topic.id)));
        if (input.tool === "move") yield* dbTry("forums.topic.moderate.posts", () => tx.update(forumPosts).set({ organizationId: patch.organizationId ?? null }).where(eq(forumPosts.topicId, topic.id)));
        yield* forumsAudit(tx, { actorId: viewer.id, action: `forums.topic.${input.tool}`, resource: "forums.topic", resourceId: topic.id, organizationId: topic.organizationId, siteId: topic.siteId, metadata });
        return { ok: true as const };
      }),
    );
  });
