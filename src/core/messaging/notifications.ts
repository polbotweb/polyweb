import { Effect } from "effect";
import { defineModuleNotifications, type NotificationRecipient } from "@/core/notifications/registry";
import { MESSAGING_MESSAGE_CREATED_EVENT } from "./service";
import type { PolywebEvent } from "@/core/events";

const recipients = (event: PolywebEvent): Effect.Effect<readonly NotificationRecipient[], never> => {
  const p = event.payload as { recipientId?: string; conversationId?: string; messageId?: string };
  if (!p.recipientId) return Effect.succeed([]);
  return Effect.succeed([{ userId: p.recipientId, organizationId: event.organizationId ?? null, resourceType: "messaging.conversation", resourceId: String(p.conversationId ?? ""), data: { messageId: p.messageId } }]);
};

export const messagingNotifications = defineModuleNotifications("messaging", [
  { type: "MESSAGE_RECEIVED", category: "messaging", channels: ["in_app"], event: MESSAGING_MESSAGE_CREATED_EVENT, recipients },
]);
