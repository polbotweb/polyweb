/**
 * Expiration des annonces publiées échues + relance 3 jours avant (idempotente).
 */
import { and, eq, isNotNull, lte, gt, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { recordEvent } from "@/core/events/outbox";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { classifiedAds } from "../schema";
import { CLASSIFIEDS_AD_EXPIRED_EVENT, CLASSIFIEDS_AD_EXPIRING_EVENT } from "../domain/events";

const THREE_DAYS = 3 * 86_400_000;

export const expireDueAds = (now = new Date(), limit = 200) =>
  Effect.gen(function* () {
    const due = yield* dbTry("classifieds.expire.due", () =>
      getDrizzle().select({ id: classifiedAds.id, organizationId: classifiedAds.organizationId, siteId: classifiedAds.siteId, authorId: classifiedAds.authorId })
        .from(classifiedAds)
        .where(and(eq(classifiedAds.lifecycle, "published"), isNotNull(classifiedAds.expiresAt), lte(classifiedAds.expiresAt, now)))
        .limit(limit),
    );
    let expired = 0;
    for (const ad of due) {
      yield* dbTransaction("classifieds.expire.one", (tx) =>
        Effect.gen(function* () {
          const updated = yield* dbTry("classifieds.expire.update", () =>
            tx.update(classifiedAds).set({ lifecycle: "expired" }).where(and(eq(classifiedAds.id, ad.id), eq(classifiedAds.lifecycle, "published"))).returning({ id: classifiedAds.id }),
          );
          if (!updated[0]) return;
          yield* recordEvent(tx, CLASSIFIEDS_AD_EXPIRED_EVENT, { adId: ad.id, siteId: ad.siteId, authorId: ad.authorId }, { organizationId: ad.organizationId });
        }),
      );
      expired += 1;
    }
    return expired;
  });

/** Relances : annonces publiées dont l'expiration est dans les 3 jours, une fois par annonce (event unique). */
export const notifyExpiringAds = (now = new Date(), limit = 200) =>
  Effect.gen(function* () {
    const until = new Date(now.getTime() + THREE_DAYS);
    const due = yield* dbTry("classifieds.expiring.due", () =>
      getDrizzle().select({ id: classifiedAds.id, organizationId: classifiedAds.organizationId, siteId: classifiedAds.siteId, authorId: classifiedAds.authorId, expiresAt: classifiedAds.expiresAt })
        .from(classifiedAds)
        .where(and(eq(classifiedAds.lifecycle, "published"), isNotNull(classifiedAds.expiresAt), gt(classifiedAds.expiresAt, now), lte(classifiedAds.expiresAt, until)))
        .limit(limit),
    );
    let sent = 0;
    for (const ad of due) {
      const already = yield* dbTry("classifieds.expiring.seen", () =>
        getDrizzle().execute(sql`select 1 from event_outbox where name = ${CLASSIFIEDS_AD_EXPIRING_EVENT} and payload->>'adId' = ${ad.id} limit 1`),
      );
      const rows = (already as unknown as { rows?: unknown[] }).rows ?? (Array.isArray(already) ? already : []);
      if (rows.length > 0) continue;
      yield* dbTransaction("classifieds.expiring.one", (tx) =>
        recordEvent(tx, CLASSIFIEDS_AD_EXPIRING_EVENT, { adId: ad.id, siteId: ad.siteId, authorId: ad.authorId, expiresAt: ad.expiresAt?.toISOString() ?? "" }, { organizationId: ad.organizationId }),
      );
      sent += 1;
    }
    return sent;
  });
