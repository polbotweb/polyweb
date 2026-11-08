/**
 * Notifications de modération (catégorie `moderation`, optionnelles : préférences in-app).
 * Déclenchées par l'événement `moderation.decided` de l'outbox, après COMMIT : l'auteur du
 * contenu est résolu à la diffusion par l'adaptateur (la charge utile ne contient ni auteur,
 * ni contenu, ni signaleur). Aucune notification historique n'est émise par ce flux.
 */
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import type { PolywebEvent } from "@/core/events";
import { defineModuleNotifications, type NotificationRecipient } from "@/core/notifications/registry";
import { getModerationTarget, moderationTargetKey, type ModerationDecisionName } from "./registry";
import { MODERATION_DECIDED_EVENT } from "./service";

const recipientsFor = (decisions: readonly ModerationDecisionName[]) => (event: PolywebEvent) =>
  Effect.gen(function* () {
    const payload = event.payload as { module?: unknown; targetType?: unknown; targetId?: unknown; decision?: unknown };
    if (typeof payload.module !== "string" || typeof payload.targetType !== "string" || typeof payload.targetId !== "string") return [];
    if (!decisions.includes(payload.decision as ModerationDecisionName)) return [];
    const key = moderationTargetKey(payload.module, payload.targetType);
    const target = getModerationTarget(key);
    if (!target) return [];
    const info = yield* target.load(getDrizzle(), payload.targetId);
    if (!info?.authorId) return [];
    const recipient: NotificationRecipient = {
      userId: info.authorId,
      organizationId: info.organizationId,
      resourceType: key,
      resourceId: payload.targetId,
      data: { decision: payload.decision as string },
    };
    return [recipient];
  });

export const moderationNotifications = defineModuleNotifications("moderation", [
  { type: "CONTENT_HIDDEN", category: "moderation", channels: ["in_app"], event: MODERATION_DECIDED_EVENT, recipients: recipientsFor(["hide", "spam"]) },
  { type: "CONTENT_RESTORED", category: "moderation", channels: ["in_app"], event: MODERATION_DECIDED_EVENT, recipients: recipientsFor(["restore"]) },
]);
