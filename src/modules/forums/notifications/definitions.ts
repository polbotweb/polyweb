/**
 * Notifications du module forums (registre core `notifications/registry`, docs/notifications.md),
 * déclenchées par l'outbox APRÈS commit et soumises aux préférences (catégorie × canal) :
 * - `TOPIC_REPLY` (forums) : abonnés du sujet, sauf l'auteur de la réponse ;
 * - `MENTION` (mentions) : personnes mentionnées ;
 * - `BADGE_AWARDED` (forums) ; `SANCTION_APPLIED` / `SANCTION_LIFTED` (moderation).
 * Destinataires filtrés à la diffusion : seuls ceux qui VOIENT encore le contenu (fil privé :
 * participants ; forum d'organisation : membres). Aucune charge ne contient de texte ni de
 * signaleur ; libellés dans `core/notifications/i18n` (`types["forums:TYPE"]`).
 */
import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { member } from "@database/schemas/auth.schema";
import type { PolywebEvent } from "@/core/events";
import { defineModuleNotifications, type NotificationRecipient } from "@/core/notifications/registry";
import { dbTry } from "@/lib/effect/run";
import { forumPosts, forumTopicFollows, forumTopicParticipants, forumTopics, forums } from "../schema";
import {
  FORUMS_BADGE_AWARDED_EVENT, FORUMS_MENTIONED_EVENT, FORUMS_POST_CREATED_EVENT, FORUMS_SANCTION_APPLIED_EVENT, FORUMS_SANCTION_REVOKED_EVENT,
} from "../domain/events";

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

/** Parmi `userIds`, ceux qui voient le sujet (visible, forum publié, privé → participants, org → membres). */
export const topicAudience = (topicId: string, userIds: readonly string[]) =>
  Effect.gen(function* () {
    if (userIds.length === 0) return [] as string[];
    const db = getDrizzle();
    const [topic] = yield* dbTry("forums.notify.topic", () =>
      db.select({ status: forumTopics.status, isPrivate: forumTopics.isPrivate, forumStatus: forums.status, visibility: forums.visibility, organizationId: forums.organizationId })
        .from(forumTopics).innerJoin(forums, eq(forums.id, forumTopics.forumId)).where(eq(forumTopics.id, topicId)).limit(1),
    );
    if (!topic || topic.status !== "visible" || topic.forumStatus !== "PUBLISHED") return [];
    let audience = [...new Set(userIds)];
    if (topic.isPrivate) {
      const rows = yield* dbTry("forums.notify.participants", () => db.select({ userId: forumTopicParticipants.userId }).from(forumTopicParticipants).where(and(eq(forumTopicParticipants.topicId, topicId), inArray(forumTopicParticipants.userId, audience))));
      audience = rows.map((r) => r.userId);
    }
    if (topic.visibility === "org" && topic.organizationId && audience.length > 0) {
      const rows = yield* dbTry("forums.notify.members", () => db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, topic.organizationId!), inArray(member.userId, audience))));
      audience = rows.map((r) => r.userId);
    }
    return audience;
  });

const replyRecipients = (event: PolywebEvent) =>
  Effect.gen(function* () {
    const p = event.payload as Record<string, unknown>;
    const topicId = str(p.topicId), postId = str(p.postId), authorId = str(p.authorId);
    if (!topicId || !postId) return [];
    const [post] = yield* dbTry("forums.notify.post", () => getDrizzle().select({ status: forumPosts.status }).from(forumPosts).where(eq(forumPosts.id, postId)).limit(1));
    if (post?.status !== "visible") return [];
    const followers = yield* dbTry("forums.notify.followers", () => getDrizzle().select({ userId: forumTopicFollows.userId }).from(forumTopicFollows).where(eq(forumTopicFollows.topicId, topicId)));
    const audience = yield* topicAudience(topicId, followers.map((f) => f.userId).filter((id) => id !== authorId));
    return audience.map((userId): NotificationRecipient => ({ userId, organizationId: event.organizationId ?? null, actorId: authorId, resourceType: "forums.topic", resourceId: topicId, data: { postId } }));
  });

const mentionRecipients = (event: PolywebEvent) =>
  Effect.gen(function* () {
    const p = event.payload as Record<string, unknown>;
    const topicId = str(p.topicId), authorId = str(p.authorId);
    const userIds = Array.isArray(p.userIds) ? p.userIds.filter((u): u is string => typeof u === "string" && u !== authorId).slice(0, 10) : [];
    if (!topicId) return [];
    const audience = yield* topicAudience(topicId, userIds);
    return audience.map((userId): NotificationRecipient => ({ userId, organizationId: event.organizationId ?? null, actorId: authorId, resourceType: "forums.topic", resourceId: topicId, data: { targetType: str(p.targetType) ?? "topic" } }));
  });

const selfRecipient = (resourceType: string, data: (p: Record<string, unknown>) => Record<string, unknown>) => (event: PolywebEvent) => {
  const p = event.payload as Record<string, unknown>;
  const userId = str(p.userId);
  if (!userId) return Effect.succeed([] as NotificationRecipient[]);
  return Effect.succeed([{ userId, organizationId: event.organizationId ?? null, resourceType, resourceId: str(p.sanctionId) ?? str(p.badge) ?? userId, data: data(p) }] as NotificationRecipient[]);
};

export const forumsNotifications = defineModuleNotifications("forums", [
  { type: "TOPIC_REPLY", category: "forums", channels: ["in_app"], event: FORUMS_POST_CREATED_EVENT, recipients: replyRecipients },
  { type: "MENTION", category: "mentions", channels: ["in_app"], event: FORUMS_MENTIONED_EVENT, recipients: mentionRecipients },
  { type: "BADGE_AWARDED", category: "forums", channels: ["in_app"], event: FORUMS_BADGE_AWARDED_EVENT, recipients: selfRecipient("forums.badge", (p) => ({ badge: str(p.badge) ?? "" })) },
  { type: "SANCTION_APPLIED", category: "moderation", channels: ["in_app"], event: FORUMS_SANCTION_APPLIED_EVENT, recipients: selfRecipient("forums.sanction", (p) => ({ kind: str(p.kind) ?? "", endsAt: str(p.endsAt) ?? "" })) },
  { type: "SANCTION_LIFTED", category: "moderation", channels: ["in_app"], event: FORUMS_SANCTION_REVOKED_EVENT, recipients: selfRecipient("forums.sanction", (p) => ({ kind: str(p.kind) ?? "" })) },
]);
