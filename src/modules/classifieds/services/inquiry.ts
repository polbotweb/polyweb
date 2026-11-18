/**
 * Contact vendeur : exception de messagerie liée à une annonce publiée et visible.
 * Les blocages restent appliqués ; la préférence destinataire (y compris « personne ») est ignorée.
 */
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { getOrCreateConversation, sendMessage, cleanMessagingBody, MESSAGING_BODY_MAX } from "@/core/messaging/service";
import { isPubliclyListed } from "../domain/rules";
import { classifiedAds, classifiedInquiries } from "../schema";
import { fail } from "@/lib/effect/failure";
import { adAccess, classifiedRateLimit, notFound, requireUser, type ClassifiedViewer } from "./access";
import { dbTry } from "@/lib/effect/run";

export const startInquiry = (adId: string, viewer: ClassifiedViewer, body: string) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    const access = yield* adAccess(adId, actor);
    if (!isPubliclyListed(access.ad.lifecycle, access.ad.moderationStatus)) return yield* notFound();
    const sellerId = access.ad.authorId;
    if (!sellerId || sellerId === actor.id) return yield* notFound();
    yield* classifiedRateLimit(actor.id, "contact");
    yield* classifiedRateLimit(actor.id, "contactAd", adId);
    const text = cleanMessagingBody(body);
    if (!text) return yield* fail("BAD_REQUEST", "Le message est obligatoire.");
    const intro = `Annonce : ${access.ad.title}\n\n${text}`.slice(0, MESSAGING_BODY_MAX);
    const opened = yield* getOrCreateConversation(actor.id, sellerId, { ignorePreference: true });
    const existing = yield* dbTry("classifieds.inquiry.find", () =>
      getDrizzle().select({ id: classifiedInquiries.id, conversationId: classifiedInquiries.conversationId }).from(classifiedInquiries).where(and(eq(classifiedInquiries.adId, adId), eq(classifiedInquiries.buyerId, actor.id))).limit(1),
    );
    if (!existing[0]) {
      yield* dbTry("classifieds.inquiry.insert", () =>
        getDrizzle().insert(classifiedInquiries).values({ adId, conversationId: opened.conversation.id, buyerId: actor.id, sellerId }),
      );
    }
    const sent = yield* sendMessage({ actorId: actor.id, conversationId: opened.conversation.id, body: intro, ignorePreference: true });
    return sent;
  });
