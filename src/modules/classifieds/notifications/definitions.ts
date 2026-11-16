/**
 * Notifications des petites annonces (registre core, libellés dans `core/notifications/i18n`).
 * Aucune charge ne contient le corps de l'annonce ni un message privé.
 */
import { Effect } from "effect";
import type { PolywebEvent } from "@/core/events";
import { defineModuleNotifications, type NotificationRecipient } from "@/core/notifications/registry";
import {
  CLASSIFIEDS_AD_APPROVED_EVENT, CLASSIFIEDS_AD_EXPIRED_EVENT, CLASSIFIEDS_AD_EXPIRING_EVENT,
  CLASSIFIEDS_AD_PUBLISHED_EVENT, CLASSIFIEDS_AD_REJECTED_EVENT,
} from "../domain/events";
import { matchingSavedSearches } from "../services/match";
import { notifyExpiringAds } from "../services/expire";

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

const authorRecipient = (event: PolywebEvent) => {
  const p = event.payload as Record<string, unknown>;
  const userId = str(p.authorId);
  const adId = str(p.adId);
  if (!userId || !adId) return Effect.succeed([] as NotificationRecipient[]);
  return Effect.succeed([{ userId, organizationId: event.organizationId ?? null, resourceType: "classifieds.ad", resourceId: adId, data: { expiresAt: str(p.expiresAt) ?? "" } }]);
};

const savedSearchRecipients = (event: PolywebEvent) =>
  Effect.gen(function* () {
    const adId = str((event.payload as Record<string, unknown>).adId);
    if (!adId) return [] as NotificationRecipient[];
    const matches = yield* matchingSavedSearches(adId);
    return matches.map((m): NotificationRecipient => ({
      userId: m.userId, organizationId: event.organizationId ?? null, resourceType: "classifieds.ad", resourceId: adId, data: { searchId: m.searchId },
    }));
  });

export const classifiedsNotifications = defineModuleNotifications(
  "classifieds",
  [
    { type: "AD_APPROVED", category: "classifieds", channels: ["in_app"], event: CLASSIFIEDS_AD_APPROVED_EVENT, recipients: authorRecipient },
    { type: "AD_REJECTED", category: "classifieds", channels: ["in_app"], event: CLASSIFIEDS_AD_REJECTED_EVENT, recipients: authorRecipient },
    { type: "AD_EXPIRING", category: "classifieds", channels: ["in_app"], event: CLASSIFIEDS_AD_EXPIRING_EVENT, recipients: authorRecipient },
    { type: "AD_EXPIRED", category: "classifieds", channels: ["in_app"], event: CLASSIFIEDS_AD_EXPIRED_EVENT, recipients: authorRecipient },
    { type: "SAVED_SEARCH_MATCH", category: "classifieds", channels: ["in_app"], event: CLASSIFIEDS_AD_PUBLISHED_EVENT, recipients: savedSearchRecipients },
  ],
  [],
  [{ id: "classifieds.expiring", run: (now) => notifyExpiringAds(now) }],
);
