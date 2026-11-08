import { Effect } from "effect";
import { ActionError, defineAction } from "astro:actions";
import { and, avg, count, eq } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { moderationReports, serviceComments, serviceReviews, services } from "@database/schemas";
import { isValidLocale } from "@/i18n/utils";
import { getServiceTranslations } from "@/modules/services/i18n";
import { getServiceNotificationTranslations } from "@/modules/services/i18n/notifications";
import { resolveServiceTenant, serviceOrganizationIdSchema } from "./_helpers";
import { auditService, invalidateServicesCache } from "./_helpers";
import { createServiceNotification } from "./notification";
import { ActionFailure, actionTry, effectHandler, fail } from "@/lib/effect/action";
import { resolveModerationReports } from "@/core/moderation/service";
import { requireServicePermission, serviceInTenant } from "@/modules/services/permissions";

function requestLocale(headers: Headers) { const candidate = headers.get("accept-language")?.split(",", 1)[0]?.split("-", 1)[0] ?? "fr"; return isValidLocale(candidate) ? candidate : "fr"; }

export const moderateServiceComment = defineAction({ input: z.object({ id: z.uuid(), serviceId: z.uuid(), organizationId: serviceOrganizationIdSchema, status: z.enum(["APPROVED", "REJECTED", "SPAM", "TRASH"]) }), handler: effectHandler((input, context) => Effect.gen(function* () {
  const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { serviceComment: ["moderate"] }); yield* serviceInTenant(input.serviceId, tenant); return yield* actionTry("services/moderation.moderateServiceComment", async () => { const t = getServiceTranslations(requestLocale(context.request.headers));
  const db = getDrizzle(); const updated = await db.update(serviceComments).set({ status: input.status }).where(and(eq(serviceComments.id, input.id), eq(serviceComments.serviceId, input.serviceId))).returning({ id: serviceComments.id, authorId: serviceComments.authorId });
  if (!updated[0]) throw new ActionError({ code: "NOT_FOUND", message: t.admin.errors.notFound });
  auditService(context, user.id, "SERVICE_COMMENT_MODERATE", { resource: "serviceComments", resourceId: input.id, metadata: { status: input.status, organizationId: tenant.organizationId } }); invalidateServicesCache(); return { success: true };
}); })) });

export const moderateServiceReview = defineAction({ input: z.object({ id: z.uuid(), serviceId: z.uuid(), organizationId: serviceOrganizationIdSchema, status: z.enum(["APPROVED", "REJECTED", "SPAM"]) }), handler: effectHandler((input, context) => Effect.gen(function* () {
  const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { serviceReview: ["moderate"] }); const service = yield* serviceInTenant(input.serviceId, tenant); return yield* actionTry("services/moderation.moderateServiceReview", async () => { const locale = requestLocale(context.request.headers); const t = getServiceTranslations(locale);
  const db = getDrizzle(); const updated = await db.update(serviceReviews).set({ status: input.status }).where(and(eq(serviceReviews.id, input.id), eq(serviceReviews.serviceId, input.serviceId))).returning({ id: serviceReviews.id, authorId: serviceReviews.authorId });
  if (!updated[0]) throw new ActionError({ code: "NOT_FOUND", message: t.admin.errors.notFound });
  const [aggregate] = await db.select({ average: avg(serviceReviews.rating), count: count() }).from(serviceReviews).where(and(eq(serviceReviews.serviceId, input.serviceId), eq(serviceReviews.status, "APPROVED")));
  const ratingCount = Number(aggregate?.count ?? 0); const ratingAverage100 = ratingCount ? Math.round(Number(aggregate?.average ?? 0) * 100) : 0;
  await db.update(services).set({ ratingAverage100, ratingCount }).where(eq(services.id, input.serviceId));
  if (updated[0].authorId && (input.status === "APPROVED" || input.status === "REJECTED")) {
    const nt = getServiceNotificationTranslations(locale);
    await createServiceNotification({ recipientId: updated[0].authorId, serviceId: input.serviceId, actorId: user.id, type: input.status === "APPROVED" ? "REVIEW_APPROVED" : "REVIEW_REJECTED", reviewId: updated[0].id, title: input.status === "APPROVED" ? nt.reviewApprovedTitle : nt.reviewRejectedTitle, message: input.status === "APPROVED" ? nt.reviewApprovedMessage : nt.reviewRejectedMessage, locale });
  }
  auditService(context, user.id, "SERVICE_REVIEW_MODERATE", { resource: "serviceReviews", resourceId: input.id, metadata: { status: input.status, ratingCount, ratingAverage100, organizationId: tenant.organizationId, serviceProviderId: service.providerId } }); invalidateServicesCache();
  return { success: true, ratingCount, ratingAverage100 };
}); })) });

/**
 * Façade historique : clôt UN signalement générique d'un service (docs/moderation.md).
 * `REVIEWED` n'existe plus (le signalement reste ouvert) ; `RESOLVED` → resolved, `REJECTED` → dismissed.
 */
export const resolveServiceReport = defineAction({ input: z.object({ id: z.uuid(), serviceId: z.uuid(), organizationId: serviceOrganizationIdSchema, status: z.enum(["REVIEWED", "RESOLVED", "REJECTED"]) }), handler: effectHandler((input, context) => Effect.gen(function* () {
  const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { service: ["moderate"] }); yield* serviceInTenant(input.serviceId, tenant);
  const t = getServiceTranslations(requestLocale(context.request.headers));
  const report = yield* actionTry("services/moderation.resolveServiceReport", async () => {
    const db = getDrizzle();
    const [row] = await db.select({ id: moderationReports.id, targetType: moderationReports.targetType, targetId: moderationReports.targetId, organizationId: moderationReports.organizationId }).from(moderationReports).where(and(eq(moderationReports.id, input.id), eq(moderationReports.module, "services"))).limit(1);
    if (!row || row.organizationId !== tenant.organizationId) return null;
    if (row.targetType === "service") return row.targetId === input.serviceId ? row : null;
    const [owner] = row.targetType === "comment"
      ? await db.select({ serviceId: serviceComments.serviceId }).from(serviceComments).where(eq(serviceComments.id, row.targetId)).limit(1)
      : await db.select({ serviceId: serviceReviews.serviceId }).from(serviceReviews).where(eq(serviceReviews.id, row.targetId)).limit(1);
    return owner?.serviceId === input.serviceId ? row : null;
  });
  if (!report) return yield* fail("NOT_FOUND", t.admin.errors.notFound);
  if (input.status === "REVIEWED") return { success: true };
  yield* resolveModerationReports({ key: `services.${report.targetType}`, targetId: report.targetId, outcome: input.status === "RESOLVED" ? "resolved" : "dismissed", actorId: user.id, organizationId: report.organizationId, siteId: null, note: "Traité depuis la file historique des services.", reportId: report.id })
    .pipe(Effect.mapError((e) => (e._tag === "ModerationUnavailableError" ? new ActionFailure({ code: "NOT_FOUND", message: t.admin.errors.notFound }) : e)));
  invalidateServicesCache();
  return { success: true };
})) });
