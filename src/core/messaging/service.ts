import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { Effect, Data } from "effect";
import {
  messagingBlocks, messagingConversationStates, messagingConversations, messagingMessages, messagingPreferences, user,
  type MessagingWhoCan,
} from "@database/schemas";
import { stripHtml } from "@/core/content/text";
import { recordEvent } from "@/core/events/outbox";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { getDrizzle } from "@/database/drizzle";

export const MESSAGING_MESSAGE_CREATED_EVENT = "messaging.message_created";
export const MESSAGING_BODY_MAX = 4000;
export const NOT_FOUND_MSG = "Élément introuvable.";

export class MessagingUnavailableError extends Data.TaggedError("MessagingUnavailableError")<{ readonly message: string }> {}
const unavailable = () => new MessagingUnavailableError({ message: NOT_FOUND_MSG });

export function cleanMessagingBody(value: string): string | null {
  const text = stripHtml(value ?? "").replace(/\s+/g, " ").trim().slice(0, MESSAGING_BODY_MAX);
  return text.length > 0 ? text : null;
}

const pair = (a: string, b: string) => (a < b ? { userLo: a, userHi: b } : { userLo: b, userHi: a });

const whoCan = (userId: string) =>
  dbTry("messaging.pref", () =>
    getDrizzle().select({ who: messagingPreferences.whoCanMessage }).from(messagingPreferences).where(eq(messagingPreferences.userId, userId)).limit(1),
  ).pipe(Effect.map((rows) => (rows[0]?.who ?? "shared_org") as MessagingWhoCan));

const isBlocked = (a: string, b: string) =>
  dbTry("messaging.block.check", () =>
    getDrizzle().select({ id: messagingBlocks.id }).from(messagingBlocks).where(
      or(and(eq(messagingBlocks.blockerId, a), eq(messagingBlocks.blockedId, b)), and(eq(messagingBlocks.blockerId, b), eq(messagingBlocks.blockedId, a))),
    ).limit(1),
  ).pipe(Effect.map((rows) => rows.length > 0));

const shareOrg = (a: string, b: string) =>
  dbTry("messaging.shareOrg", async () => {
    const result = await getDrizzle().execute(sql`
      select m1.organization_id as id from member m1
      inner join member m2 on m2.organization_id = m1.organization_id and m2.user_id = ${b}
      where m1.user_id = ${a} limit 1`);
    const rows = (result as unknown as { rows?: { id: string }[] }).rows ?? [];
    return rows;
  }).pipe(Effect.map((rows) => rows[0]?.id ?? null));

export const assertCanMessage = (fromUserId: string, toUserId: string) =>
  Effect.gen(function* () {
    if (fromUserId === toUserId) return yield* Effect.fail(unavailable());
    const [exists] = yield* dbTry("messaging.user", () => getDrizzle().select({ id: user.id }).from(user).where(eq(user.id, toUserId)).limit(1));
    if (!exists) return yield* Effect.fail(unavailable());
    if (yield* isBlocked(fromUserId, toUserId)) return yield* Effect.fail(unavailable());
    const pref = yield* whoCan(toUserId);
    if (pref === "nobody") return yield* Effect.fail(unavailable());
    if (pref === "everyone") return { organizationId: yield* shareOrg(fromUserId, toUserId) };
    const organizationId = yield* shareOrg(fromUserId, toUserId);
    if (!organizationId) return yield* Effect.fail(unavailable());
    return { organizationId };
  });

export const getOrCreateConversation = (actorId: string, otherUserId: string) =>
  Effect.gen(function* () {
    const scope = yield* assertCanMessage(actorId, otherUserId);
    const { userLo, userHi } = pair(actorId, otherUserId);
    return yield* dbTransaction("messaging.conversation.open", (tx) =>
      Effect.gen(function* () {
        const existing = yield* dbTry("messaging.conversation.find", () =>
          tx.select().from(messagingConversations).where(and(eq(messagingConversations.userLo, userLo), eq(messagingConversations.userHi, userHi))).limit(1),
        );
        let conversation = existing[0];
        if (!conversation) {
          const [created] = yield* dbTry("messaging.conversation.insert", () => tx.insert(messagingConversations).values({ userLo, userHi }).returning());
          conversation = created;
          yield* dbTry("messaging.conversation.states", () =>
            tx.insert(messagingConversationStates).values([
              { conversationId: conversation.id, userId: actorId },
              { conversationId: conversation.id, userId: otherUserId },
            ]).onConflictDoNothing(),
          );
        } else {
          yield* dbTry("messaging.conversation.reopen", () =>
            tx.insert(messagingConversationStates).values({ conversationId: conversation.id, userId: actorId, deletedAt: null })
              .onConflictDoUpdate({ target: [messagingConversationStates.conversationId, messagingConversationStates.userId], set: { deletedAt: null } }),
          );
        }
        return { conversation, organizationId: scope.organizationId };
      }),
    );
  });

export const sendMessage = (input: { actorId: string; conversationId: string; body: string }) =>
  Effect.gen(function* () {
    const body = cleanMessagingBody(input.body);
    if (!body) return yield* Effect.fail(new MessagingUnavailableError({ message: "Message vide." }));
    return yield* dbTransaction("messaging.send", (tx) =>
      Effect.gen(function* () {
        const [conv] = yield* dbTry("messaging.send.conv", () => tx.select().from(messagingConversations).where(eq(messagingConversations.id, input.conversationId)).limit(1));
        if (!conv) return yield* Effect.fail(unavailable());
        const other = conv.userLo === input.actorId ? conv.userHi : conv.userHi === input.actorId ? conv.userLo : null;
        if (!other) return yield* Effect.fail(unavailable());
        const scope = yield* assertCanMessage(input.actorId, other);
        const [msg] = yield* dbTry("messaging.send.insert", () =>
          tx.insert(messagingMessages).values({ conversationId: conv.id, senderId: input.actorId, body, organizationId: scope.organizationId }).returning({ id: messagingMessages.id, createdAt: messagingMessages.createdAt }),
        );
        yield* dbTry("messaging.send.touch", () => tx.update(messagingConversations).set({ lastMessageAt: msg.createdAt }).where(eq(messagingConversations.id, conv.id)));
        yield* dbTry("messaging.send.states", () =>
          tx.insert(messagingConversationStates).values([
            { conversationId: conv.id, userId: input.actorId, deletedAt: null },
            { conversationId: conv.id, userId: other, deletedAt: null },
          ]).onConflictDoUpdate({ target: [messagingConversationStates.conversationId, messagingConversationStates.userId], set: { deletedAt: null } }),
        );
        yield* recordEvent(tx, MESSAGING_MESSAGE_CREATED_EVENT, { messageId: msg.id, conversationId: conv.id, recipientId: other, senderId: input.actorId }, { organizationId: scope.organizationId });
        return { messageId: msg.id, conversationId: conv.id };
      }),
    );
  });

export const listConversations = (userId: string, limit = 50) =>
  dbTry("messaging.list", () =>
    getDrizzle().select({
      id: messagingConversations.id, userLo: messagingConversations.userLo, userHi: messagingConversations.userHi,
      lastMessageAt: messagingConversations.lastMessageAt, lastReadAt: messagingConversationStates.lastReadAt,
    }).from(messagingConversationStates)
      .innerJoin(messagingConversations, eq(messagingConversations.id, messagingConversationStates.conversationId))
      .where(and(eq(messagingConversationStates.userId, userId), isNull(messagingConversationStates.deletedAt)))
      .orderBy(desc(messagingConversations.lastMessageAt)).limit(limit),
  );

export const listMessages = (userId: string, conversationId: string, limit = 100) =>
  Effect.gen(function* () {
    const [state] = yield* dbTry("messaging.messages.state", () =>
      getDrizzle().select().from(messagingConversationStates).where(and(
        eq(messagingConversationStates.conversationId, conversationId), eq(messagingConversationStates.userId, userId), isNull(messagingConversationStates.deletedAt),
      )).limit(1),
    );
    if (!state) return yield* Effect.fail(unavailable());
    const rows = yield* dbTry("messaging.messages.list", () =>
      getDrizzle().select({ id: messagingMessages.id, senderId: messagingMessages.senderId, body: messagingMessages.body, status: messagingMessages.status, createdAt: messagingMessages.createdAt })
        .from(messagingMessages).where(and(eq(messagingMessages.conversationId, conversationId), eq(messagingMessages.status, "visible")))
        .orderBy(asc(messagingMessages.createdAt)).limit(limit),
    );
    yield* dbTry("messaging.messages.read", () =>
      getDrizzle().update(messagingConversationStates).set({ lastReadAt: new Date() })
        .where(and(eq(messagingConversationStates.conversationId, conversationId), eq(messagingConversationStates.userId, userId))),
    );
    return rows;
  });

export const deleteConversationForSelf = (userId: string, conversationId: string) =>
  Effect.gen(function* () {
    const updated = yield* dbTry("messaging.delete.self", () =>
      getDrizzle().update(messagingConversationStates).set({ deletedAt: new Date() })
        .where(and(eq(messagingConversationStates.conversationId, conversationId), eq(messagingConversationStates.userId, userId)))
        .returning({ userId: messagingConversationStates.userId }),
    );
    if (updated.length === 0) return yield* Effect.fail(unavailable());
  });

export const setBlock = (blockerId: string, blockedId: string, blocked: boolean) =>
  Effect.gen(function* () {
    if (blockerId === blockedId) return yield* Effect.fail(unavailable());
    const [exists] = yield* dbTry("messaging.block.user", () => getDrizzle().select({ id: user.id }).from(user).where(eq(user.id, blockedId)).limit(1));
    if (!exists) return yield* Effect.fail(unavailable());
    if (blocked) yield* dbTry("messaging.block.add", () => getDrizzle().insert(messagingBlocks).values({ blockerId, blockedId }).onConflictDoNothing());
    else yield* dbTry("messaging.block.remove", () => getDrizzle().delete(messagingBlocks).where(and(eq(messagingBlocks.blockerId, blockerId), eq(messagingBlocks.blockedId, blockedId))));
  });

export const setMessagingPreference = (userId: string, whoCanMessage: MessagingWhoCan) =>
  dbTry("messaging.pref.set", () =>
    getDrizzle().insert(messagingPreferences).values({ userId, whoCanMessage, updatedAt: new Date() })
      .onConflictDoUpdate({ target: messagingPreferences.userId, set: { whoCanMessage, updatedAt: new Date() } }),
  ).pipe(Effect.asVoid);

export const getMessagingPreference = (userId: string) => whoCan(userId);
