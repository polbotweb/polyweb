import { and, eq, or } from "drizzle-orm";
import { Effect } from "effect";
import { messagingConversations, messagingMessages } from "@database/schemas";
import { stripHtml } from "@/core/content/text";
import { dbTry } from "@/lib/effect/run";
import { defineModuleModeration, type ModerationDecisionName, type ModerationExecutor, type ModerationTargetAdapter } from "@/core/moderation/registry";

const EXCERPT = 280;
export function messagingMessageTransition(current: string, decision: ModerationDecisionName): string | null {
  if (decision === "restore") return current === "hidden" ? "visible" : null;
  return current === "hidden" ? null : "hidden";
}
const clip = (html: string) => stripHtml(html).replace(/\s+/g, " ").trim().slice(0, EXCERPT);

const message: ModerationTargetAdapter = {
  type: "message", permission: { messaging: ["moderate"] }, reporters: "authenticated",
  load: (executor, id) => Effect.gen(function* () {
    const rows = yield* dbTry("moderation.messaging.message.load", () =>
      executor.select({ status: messagingMessages.status, organizationId: messagingMessages.organizationId, senderId: messagingMessages.senderId })
        .from(messagingMessages).where(eq(messagingMessages.id, id)).limit(1));
    const row = rows[0]; if (!row) return null;
    return { organizationId: row.organizationId, siteId: null, authorId: row.senderId, status: row.status, publiclyVisible: row.status === "visible" };
  }),
  excerpt: (executor, id) => Effect.gen(function* () {
    const rows = yield* dbTry("moderation.messaging.message.excerpt", () =>
      executor.select({ body: messagingMessages.body }).from(messagingMessages).where(eq(messagingMessages.id, id)).limit(1));
    const row = rows[0]; if (!row) return null;
    return { title: null, text: clip(row.body), url: null };
  }),
  apply: (tx, id, decision, current) => Effect.gen(function* () {
    const next = messagingMessageTransition(current.status, decision); if (!next) return null;
    const updated = yield* dbTry("moderation.messaging.message.apply", () =>
      tx.update(messagingMessages).set({ status: next as "visible" | "hidden" })
        .where(and(eq(messagingMessages.id, id), eq(messagingMessages.status, current.status as "visible" | "hidden")))
        .returning({ id: messagingMessages.id }));
    return updated.length ? next : null;
  }),
};
export const messagingModeration = defineModuleModeration("messaging", [message]);
export const isMessagingParticipant = (executor: ModerationExecutor, messageId: string, userId: string) =>
  dbTry("messaging.participant", () =>
    executor.select({ id: messagingMessages.id }).from(messagingMessages)
      .innerJoin(messagingConversations, eq(messagingConversations.id, messagingMessages.conversationId))
      .where(and(eq(messagingMessages.id, messageId), or(eq(messagingConversations.userLo, userId), eq(messagingConversations.userHi, userId)))).limit(1),
  ).pipe(Effect.map((rows) => rows.length > 0));
