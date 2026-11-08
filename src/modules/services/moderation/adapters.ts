/**
 * Cibles de modération des services (registre core `moderation/registry`, docs/moderation.md).
 * - `service` : signalement seulement (statut éditorial inchangé) ;
 * - `comment`, `review` : hide → REJECTED, spam → SPAM, restore → APPROVED ; une décision sur un
 *   avis recalcule la note du service (moyenne ×100 et nombre d'avis approuvés) dans la même transaction.
 * Signalement réservé aux utilisateurs connectés (comme le flux historique).
 */
import { and, avg, count, eq, lte, sql } from "drizzle-orm";
import { Effect } from "effect";
import { organization, serviceComments, serviceReviews, services, serviceTranslations } from "@database/schemas";
import { invalidateCache } from "@database/cache";
import { stripHtml } from "@/core/content/text";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";
import { defineModuleModeration, type ModerationDecisionName, type ModerationExecutor, type ModerationTargetAdapter } from "@/core/moderation/registry";

const EXCERPT = 280;
const HIDDEN: Record<ModerationDecisionName, string> = { hide: "REJECTED", spam: "SPAM", restore: "APPROVED" };
const RESTORABLE = new Set(["REJECTED", "SPAM", "TRASH"]);

export function serviceEngagementTransition(current: string, decision: ModerationDecisionName): string | null {
  if (decision === "restore") return RESTORABLE.has(current) ? HIDDEN.restore : null;
  return current === HIDDEN[decision] ? null : HIDDEN[decision];
}

const invalidateServices = () => {
  for (const prefix of ["services:service:", "services:list:", "services:search:"]) invalidateCache(prefix);
};

const serviceIsPublic = (executor: ModerationExecutor, serviceId: string) =>
  dbTry("moderation.services.public", () =>
    executor
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.status, "PUBLISHED"), lte(services.publishedAt, sql`now()`)))
      .limit(1),
  ).pipe(Effect.map((rows) => rows.length > 0));

const serviceLink = (executor: ModerationExecutor, serviceId: string, locale: string) =>
  dbTry("moderation.services.link", () =>
    executor
      .select({ slug: services.slug, orgSlug: organization.slug, title: serviceTranslations.title, localizedSlug: serviceTranslations.slug })
      .from(services)
      .leftJoin(organization, eq(organization.id, services.organizationId))
      .leftJoin(serviceTranslations, and(eq(serviceTranslations.serviceId, services.id), eq(serviceTranslations.locale, locale as "fr")))
      .where(eq(services.id, serviceId))
      .limit(1),
  ).pipe(
    Effect.map(([row]) => (row ? { title: row.title ?? row.slug, url: `/${locale}${row.orgSlug ? `/${row.orgSlug}` : ""}/services/${row.localizedSlug ?? row.slug}` } : null)),
  );

const clip = (html: string) => stripHtml(html).replace(/\s+/g, " ").trim().slice(0, EXCERPT);

/** Note agrégée du service : avis APPROVED seulement (même règle que la modération historique). */
export const recomputeServiceRating = (tx: DbTransaction, serviceId: string) =>
  Effect.gen(function* () {
    const [aggregate] = yield* dbTry("moderation.services.rating.aggregate", () =>
      tx.select({ average: avg(serviceReviews.rating), count: count() }).from(serviceReviews).where(and(eq(serviceReviews.serviceId, serviceId), eq(serviceReviews.status, "APPROVED"))),
    );
    const ratingCount = Number(aggregate?.count ?? 0);
    const ratingAverage100 = ratingCount ? Math.round(Number(aggregate?.average ?? 0) * 100) : 0;
    yield* dbTry("moderation.services.rating.update", () => tx.update(services).set({ ratingAverage100, ratingCount }).where(eq(services.id, serviceId)));
    return { ratingCount, ratingAverage100 };
  });

const service: ModerationTargetAdapter = {
  type: "service",
  permission: { service: ["moderate"] },
  reporters: "authenticated",
  load: (executor, id) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("moderation.services.service.load", () =>
        executor.select({ organizationId: services.organizationId, authorId: services.providerId, status: services.status }).from(services).where(eq(services.id, id)).limit(1),
      );
      if (!row) return null;
      return { organizationId: row.organizationId, siteId: null, authorId: row.authorId, status: row.status, publiclyVisible: yield* serviceIsPublic(executor, id) };
    }),
  excerpt: (executor, id, locale) => serviceLink(executor, id, locale).pipe(Effect.map((link) => (link ? { title: link.title, text: "", url: link.url } : null))),
};

const comment: ModerationTargetAdapter = {
  type: "comment",
  permission: { serviceComment: ["moderate"] },
  reporters: "authenticated",
  load: (executor, id) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("moderation.services.comment.load", () =>
        executor
          .select({ serviceId: serviceComments.serviceId, authorId: serviceComments.authorId, status: serviceComments.status, organizationId: services.organizationId })
          .from(serviceComments)
          .innerJoin(services, eq(services.id, serviceComments.serviceId))
          .where(eq(serviceComments.id, id))
          .limit(1),
      );
      if (!row) return null;
      const visible = row.status === "APPROVED" && (yield* serviceIsPublic(executor, row.serviceId));
      return { organizationId: row.organizationId, siteId: null, authorId: row.authorId, status: row.status, publiclyVisible: visible };
    }),
  excerpt: (executor, id, locale) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("moderation.services.comment.excerpt", () =>
        executor.select({ serviceId: serviceComments.serviceId, content: serviceComments.content }).from(serviceComments).where(eq(serviceComments.id, id)).limit(1),
      );
      if (!row) return null;
      const link = yield* serviceLink(executor, row.serviceId, locale);
      return { title: link?.title ?? null, text: clip(row.content), url: link?.url ?? null };
    }),
  apply: (tx, id, decision, current) =>
    Effect.gen(function* () {
      const next = serviceEngagementTransition(current.status, decision);
      if (!next) return null;
      const updated = yield* dbTry("moderation.services.comment.apply", () =>
        tx
          .update(serviceComments)
          .set({ status: next as "APPROVED" })
          .where(and(eq(serviceComments.id, id), eq(serviceComments.status, current.status as "APPROVED")))
          .returning({ id: serviceComments.id }),
      );
      return updated.length > 0 ? next : null;
    }),
  afterCommit: invalidateServices,
};

const review: ModerationTargetAdapter = {
  type: "review",
  permission: { serviceReview: ["moderate"] },
  reporters: "authenticated",
  load: (executor, id) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("moderation.services.review.load", () =>
        executor
          .select({ serviceId: serviceReviews.serviceId, authorId: serviceReviews.authorId, status: serviceReviews.status, organizationId: services.organizationId })
          .from(serviceReviews)
          .innerJoin(services, eq(services.id, serviceReviews.serviceId))
          .where(eq(serviceReviews.id, id))
          .limit(1),
      );
      if (!row) return null;
      const visible = row.status === "APPROVED" && (yield* serviceIsPublic(executor, row.serviceId));
      return { organizationId: row.organizationId, siteId: null, authorId: row.authorId, status: row.status, publiclyVisible: visible };
    }),
  excerpt: (executor, id, locale) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("moderation.services.review.excerpt", () =>
        executor.select({ serviceId: serviceReviews.serviceId, title: serviceReviews.title, content: serviceReviews.content }).from(serviceReviews).where(eq(serviceReviews.id, id)).limit(1),
      );
      if (!row) return null;
      const link = yield* serviceLink(executor, row.serviceId, locale);
      return { title: row.title ? clip(row.title) : link?.title ?? null, text: clip(row.content), url: link?.url ?? null };
    }),
  apply: (tx, id, decision, current) =>
    Effect.gen(function* () {
      const next = serviceEngagementTransition(current.status, decision);
      if (!next || next === "TRASH") return null;
      const updated = yield* dbTry("moderation.services.review.apply", () =>
        tx
          .update(serviceReviews)
          .set({ status: next as "APPROVED" })
          .where(and(eq(serviceReviews.id, id), eq(serviceReviews.status, current.status as "APPROVED")))
          .returning({ serviceId: serviceReviews.serviceId }),
      );
      const [row] = updated;
      if (!row) return null;
      yield* recomputeServiceRating(tx, row.serviceId);
      return next;
    }),
  afterCommit: invalidateServices,
};

export const servicesModeration = defineModuleModeration("services", [service, comment, review]);
