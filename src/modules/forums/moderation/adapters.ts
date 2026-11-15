/**
 * Cibles de modération des forums (registre core `moderation/registry`, docs/moderation.md) :
 * sujets et réponses. `apply` change le statut (`visible` / `hidden` / `spam`), horodate la
 * décision, recalcule la réputation de l'auteur et — pour une décision retenue (masquage, spam) —
 * évalue la sanction automatique, le tout dans la transaction de la décision.
 * `canReport` : seul un lecteur qui VOIT le contenu peut le signaler (forum membres / organisation,
 * fil privé) ; un refus est indiscernable d'une cible absente. Les modérateurs ne voient d'un fil
 * privé que l'extrait signalé.
 */
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { stripHtml } from "@/core/content/text";
import { dbTry } from "@/lib/effect/run";
import { defineModuleModeration, type ModerationDecisionName, type ModerationExecutor, type ModerationTargetAdapter } from "@/core/moderation/registry";
import { forumPosts, forumTopics, forums } from "../schema";
import { canViewForum, forumContentTransition } from "../domain/rules";
import { evaluateAutoSanction } from "../services/sanctions";
import { recomputeMemberStats } from "../services/reputation";
import { isParticipant } from "../services/access";
import { visibleReplyCount } from "../services/counters";
import { organizationRoleOf } from "@/core/permissions/tenant";

const EXCERPT = 280;
const clip = (text: string) => stripHtml(text).replace(/\s+/g, " ").trim().slice(0, EXCERPT);

type TopicRow = { id: string; status: string; organizationId: string | null; siteId: string; authorId: string | null; isPrivate: boolean; forumStatus: string; visibility: "public" | "members" | "org"; title: string; body: string };

const topicRow = (executor: ModerationExecutor, id: string) =>
  dbTry("moderation.forums.topic.load", () =>
    executor.select({
      id: forumTopics.id, status: forumTopics.status, organizationId: forumTopics.organizationId, siteId: forumTopics.siteId, authorId: forumTopics.authorId,
      isPrivate: forumTopics.isPrivate, forumStatus: forums.status, visibility: forums.visibility, title: forumTopics.title, body: forumTopics.body,
    }).from(forumTopics).innerJoin(forums, eq(forums.id, forumTopics.forumId)).where(eq(forumTopics.id, id)).limit(1),
  ).pipe(Effect.map((rows) => (rows[0] as TopicRow | undefined) ?? null));

const publicTopic = (t: TopicRow) => t.status === "visible" && !t.isPrivate && t.forumStatus === "PUBLISHED" && t.visibility === "public";

/** Le signaleur voit-il le sujet ? (membres, organisation, participants de fil privé). */
const reporterSees = (executor: ModerationExecutor, t: TopicRow, reporterId: string | null) =>
  Effect.gen(function* () {
    if (t.status !== "visible") return false;
    if (t.isPrivate) return yield* isParticipant(executor, t.id, reporterId);
    const orgMember = t.visibility === "org" && reporterId && t.organizationId ? (yield* organizationRoleOf(reporterId, t.organizationId)) !== null : false;
    return canViewForum({ status: t.forumStatus, visibility: t.visibility, organizationId: t.organizationId, signedIn: reporterId !== null, orgMember, manager: false });
  });

const afterDecision = (tx: Parameters<NonNullable<ModerationTargetAdapter["apply"]>>[0], decision: ModerationDecisionName, scope: { siteId: string; organizationId: string | null; authorId: string | null }) =>
  Effect.gen(function* () {
    yield* recomputeMemberStats(tx, { siteId: scope.siteId, userId: scope.authorId, organizationId: scope.organizationId });
    if (decision !== "restore") yield* evaluateAutoSanction(tx, { siteId: scope.siteId, organizationId: scope.organizationId, userId: scope.authorId });
  });

const topic: ModerationTargetAdapter = {
  type: "topic", permission: { forums: ["moderate"] }, reporters: "authenticated",
  load: (executor, id) => topicRow(executor, id).pipe(Effect.map((t) => t && { organizationId: t.organizationId, siteId: t.siteId, authorId: t.authorId, status: t.status, publiclyVisible: publicTopic(t) })),
  canReport: (executor, id, reporterId) => topicRow(executor, id).pipe(Effect.flatMap((t) => (t ? reporterSees(executor, t, reporterId) : Effect.succeed(false)))),
  excerpt: (executor, id) => topicRow(executor, id).pipe(Effect.map((t) => t && { title: t.title, text: clip(t.body), url: null })),
  apply: (tx, id, decision, current) =>
    Effect.gen(function* () {
      const next = forumContentTransition(current.status, decision);
      if (!next) return null;
      const updated = yield* dbTry("moderation.forums.topic.apply", () =>
        tx.update(forumTopics).set({ status: next, moderatedAt: new Date() }).where(and(eq(forumTopics.id, id), eq(forumTopics.status, current.status as "visible"))).returning({ siteId: forumTopics.siteId }),
      );
      if (!updated[0]) return null;
      yield* afterDecision(tx, decision, { siteId: updated[0].siteId, organizationId: current.organizationId, authorId: current.authorId });
      return next;
    }),
};

type PostRow = { id: string; status: string; authorId: string | null; body: string; topicId: string };

const postRow = (executor: ModerationExecutor, id: string) =>
  dbTry("moderation.forums.post.load", () =>
    executor.select({ id: forumPosts.id, status: forumPosts.status, authorId: forumPosts.authorId, body: forumPosts.body, topicId: forumPosts.topicId }).from(forumPosts).where(eq(forumPosts.id, id)).limit(1),
  ).pipe(Effect.map((rows) => (rows[0] as PostRow | undefined) ?? null));

const postWithTopic = (executor: ModerationExecutor, id: string) =>
  Effect.gen(function* () {
    const post = yield* postRow(executor, id);
    if (!post) return null;
    const parent = yield* topicRow(executor, post.topicId);
    return parent ? { post, parent } : null;
  });

const post: ModerationTargetAdapter = {
  type: "post", permission: { forums: ["moderate"] }, reporters: "authenticated",
  load: (executor, id) => postWithTopic(executor, id).pipe(Effect.map((r) => r && {
    organizationId: r.parent.organizationId, siteId: r.parent.siteId, authorId: r.post.authorId, status: r.post.status,
    publiclyVisible: r.post.status === "visible" && publicTopic(r.parent),
  })),
  canReport: (executor, id, reporterId) =>
    postWithTopic(executor, id).pipe(Effect.flatMap((r) => (r && r.post.status === "visible" ? reporterSees(executor, r.parent, reporterId) : Effect.succeed(false)))),
  excerpt: (executor, id) => postWithTopic(executor, id).pipe(Effect.map((r) => r && { title: r.parent.isPrivate ? null : r.parent.title, text: clip(r.post.body), url: null })),
  apply: (tx, id, decision, current) =>
    Effect.gen(function* () {
      const next = forumContentTransition(current.status, decision);
      if (!next) return null;
      const updated = yield* dbTry("moderation.forums.post.apply", () =>
        tx.update(forumPosts).set({ status: next, moderatedAt: new Date() }).where(and(eq(forumPosts.id, id), eq(forumPosts.status, current.status as "visible"))).returning({ siteId: forumPosts.siteId, topicId: forumPosts.topicId }),
      );
      if (!updated[0]) return null;
      // Compteur de réponses visibles du sujet (exact).
      yield* dbTry("moderation.forums.post.count", () =>
        tx.update(forumTopics).set({ replyCount: visibleReplyCount(updated[0].topicId) }).where(eq(forumTopics.id, updated[0].topicId)),
      );
      yield* afterDecision(tx, decision, { siteId: updated[0].siteId, organizationId: current.organizationId, authorId: current.authorId });
      return next;
    }),
};

export const forumsModeration = defineModuleModeration("forums", [topic, post]);
