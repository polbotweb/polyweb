import { defineAction, type ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { MESSAGING_WHO_CAN } from "@database/schemas/messaging.schema";
import { MODERATION_REPORT_REASONS } from "@database/schemas/moderation.schema";
import {
  assertCanMessage, deleteConversationForSelf, getMessagingPreference, getOrCreateConversation,
  listConversations, listMessages, MESSAGING_BODY_MAX, NOT_FOUND_MSG, sendMessage, setBlock, setMessagingPreference, MessagingUnavailableError,
} from "@/core/messaging/service";
import { reportModerationTarget } from "@/actions/moderation";
import { isMessagingParticipant } from "@/modules/messaging/moderation/adapters";
import { registerModerationTargets } from "@/modules/moderation";
import { getDrizzle } from "@/database/drizzle";
import { checkRateLimit } from "@/lib/rate-limit";
import { ActionFailure, actionRateLimit, effectHandler, fail, requireUser } from "@/lib/effect/action";

const toFail = (error: unknown) => {
  if (error instanceof MessagingUnavailableError || (error as { _tag?: string })._tag === "MessagingUnavailableError")
    return new ActionFailure({ code: "NOT_FOUND", message: NOT_FOUND_MSG });
  return error;
};

export const messaging = {
  preferenceGet: defineAction({ handler: effectHandler((_i, c) => Effect.gen(function* () { const u = yield* requireUser(c); return { whoCanMessage: yield* getMessagingPreference(u.id) }; })) }),
  preferenceSet: defineAction({ input: z.object({ whoCanMessage: z.enum(MESSAGING_WHO_CAN) }), handler: effectHandler((input, c) => Effect.gen(function* () { const u = yield* requireUser(c); yield* actionRateLimit(u.id, "messaging-pref", { window: 60, max: 20 }); yield* setMessagingPreference(u.id, input.whoCanMessage); return { ok: true as const }; })) }),
  start: defineAction({ input: z.object({ userId: z.string().min(1).max(64), body: z.string().min(1).max(MESSAGING_BODY_MAX) }), handler: effectHandler((input, c) => Effect.gen(function* () {
    const u = yield* requireUser(c); yield* actionRateLimit(u.id, "messaging", { window: 60, max: 30 });
    if (!checkRateLimit(`messaging-new:${u.id}`, { window: 3600, max: 5 }).allowed) return yield* fail("TOO_MANY_REQUESTS", "Trop de nouvelles conversations. Réessayez plus tard.");
    if (!checkRateLimit(`messaging-send:${u.id}`, { window: 600, max: 20 }).allowed) return yield* fail("TOO_MANY_REQUESTS", "Trop de messages. Réessayez plus tard.");
    const { conversation } = yield* getOrCreateConversation(u.id, input.userId);
    return yield* sendMessage({ actorId: u.id, conversationId: conversation.id, body: input.body });
  }).pipe(Effect.mapError(toFail))) }),
  send: defineAction({ input: z.object({ conversationId: z.string().min(1).max(64), body: z.string().min(1).max(MESSAGING_BODY_MAX) }), handler: effectHandler((input, c) => Effect.gen(function* () {
    const u = yield* requireUser(c); yield* actionRateLimit(u.id, "messaging", { window: 60, max: 30 });
    if (!checkRateLimit(`messaging-send:${u.id}`, { window: 600, max: 20 }).allowed) return yield* fail("TOO_MANY_REQUESTS", "Trop de messages. Réessayez plus tard.");
    return yield* sendMessage({ actorId: u.id, conversationId: input.conversationId, body: input.body });
  }).pipe(Effect.mapError(toFail))) }),
  list: defineAction({ handler: effectHandler((_i, c) => Effect.gen(function* () { const u = yield* requireUser(c); return { items: yield* listConversations(u.id) }; })) }),
  messages: defineAction({ input: z.object({ conversationId: z.string().min(1).max(64) }), handler: effectHandler((input, c) => Effect.gen(function* () { const u = yield* requireUser(c); return { items: yield* listMessages(u.id, input.conversationId) }; }).pipe(Effect.mapError(toFail))) }),
  deleteForMe: defineAction({ input: z.object({ conversationId: z.string().min(1).max(64) }), handler: effectHandler((input, c) => Effect.gen(function* () { const u = yield* requireUser(c); yield* deleteConversationForSelf(u.id, input.conversationId); return { ok: true as const }; }).pipe(Effect.mapError(toFail))) }),
  block: defineAction({ input: z.object({ userId: z.string().min(1).max(64), blocked: z.boolean() }), handler: effectHandler((input, c) => Effect.gen(function* () { const u = yield* requireUser(c); yield* actionRateLimit(u.id, "messaging-block", { window: 60, max: 30 }); yield* setBlock(u.id, input.userId, input.blocked); return { ok: true as const }; }).pipe(Effect.mapError(toFail))) }),
  report: defineAction({ input: z.object({ messageId: z.string().min(1).max(64), reason: z.enum(MODERATION_REPORT_REASONS), description: z.string().max(1000).optional().nullable() }), handler: effectHandler((input, context: ActionAPIContext) => Effect.gen(function* () {
    registerModerationTargets(); const u = yield* requireUser(context);
    if (!(yield* isMessagingParticipant(getDrizzle(), input.messageId, u.id))) return yield* fail("NOT_FOUND", NOT_FOUND_MSG);
    return yield* reportModerationTarget({ target: "messaging.message", id: input.messageId, reason: input.reason, description: input.description ?? null }, context);
  }).pipe(Effect.mapError(toFail))) }),
  canMessage: defineAction({ input: z.object({ userId: z.string().min(1).max(64) }), handler: effectHandler((input, c) => Effect.gen(function* () { const u = yield* requireUser(c); yield* assertCanMessage(u.id, input.userId); return { ok: true as const }; }).pipe(Effect.mapError(toFail))) }),
};
