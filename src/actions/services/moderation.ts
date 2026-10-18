import { ActionError, defineAction } from "astro:actions";
import { and, avg, count, eq } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { serviceComments, serviceReviews, serviceReports, services } from "@database/schemas";
import { isValidLocale } from "@/i18n/utils";
import { getServiceTranslations } from "@/modules/services/i18n";
import { getServiceNotificationTranslations } from "@/modules/services/i18n/notifications";
import { assertServiceInTenant, assertServicePermission, resolveServiceTenant, serviceOrganizationIdSchema } from "./_helpers";
import { auditService, invalidateServicesCache } from "./_helpers";
import { createServiceNotification } from "./notification";

function requestLocale(headers: Headers) { const candidate = headers.get("accept-language")?.split(",", 1)[0]?.split("-", 1)[0] ?? "fr"; return isValidLocale(candidate) ? candidate : "fr"; }

export const moderateServiceComment = defineAction({ input: z.object({ id: z.uuid(), serviceId: z.uuid(), organizationId: serviceOrganizationIdSchema, status: z.enum(["APPROVED", "REJECTED", "SPAM", "TRASH"]) }), handler: async (input, context) => {
  const tenant = resolveServiceTenant(input); const user = await assertServicePermission(context, tenant, { serviceComment: ["moderate"] }); await assertServiceInTenant(input.serviceId, tenant); const t = getServiceTranslations(requestLocale(context.request.headers));
  const db = getDrizzle(); const updated = await db.update(serviceComments).set({ status: input.status }).where(and(eq(serviceComments.id, input.id), eq(serviceComments.serviceId, input.serviceId))).returning({ id: serviceComments.id, authorId: serviceComments.authorId });
  if (!updated[0]) throw new ActionError({ code: "NOT_FOUND", message: t.admin.errors.notFound });
  auditService(context, user.id, "SERVICE_COMMENT_MODERATE", { resource: "serviceComments", resourceId: input.id, metadata: { status: input.status, organizationId: tenant.organizationId } }); invalidateServicesCache(); return { success: true };
} });

export const moderateServiceReview = defineAction({ input: z.object({ id: z.uuid(), serviceId: z.uuid(), organizationId: serviceOrganizationIdSchema, status: z.enum(["APPROVED", "REJECTED", "SPAM"]) }), handler: async (input, context) => {
  const tenant = resolveServiceTenant(input); const user = await assertServicePermission(context, tenant, { serviceReview: ["moderate"] }); const service = await assertServiceInTenant(input.serviceId, tenant); const locale = requestLocale(context.request.headers); const t = getServiceTranslations(locale);
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
} });

export const resolveServiceReport = defineAction({ input: z.object({ id: z.uuid(), serviceId: z.uuid(), organizationId: serviceOrganizationIdSchema, status: z.enum(["REVIEWED", "RESOLVED", "REJECTED"]) }), handler: async (input, context) => {
  const tenant = resolveServiceTenant(input); const user = await assertServicePermission(context, tenant, { service: ["moderate"] }); await assertServiceInTenant(input.serviceId, tenant); const t = getServiceTranslations(requestLocale(context.request.headers));
  const db = getDrizzle(); const [report] = await db.select({ id: serviceReports.id, serviceId: serviceReports.serviceId, commentId: serviceReports.commentId, reviewId: serviceReports.reviewId }).from(serviceReports).where(eq(serviceReports.id, input.id)).limit(1);
  if (!report) throw new ActionError({ code: "NOT_FOUND", message: t.admin.errors.notFound });
  if (report.serviceId !== null && report.serviceId !== input.serviceId) throw new ActionError({ code: "FORBIDDEN", message: t.admin.errors.forbidden });
  if (report.commentId) { const [comment] = await db.select({ serviceId: serviceComments.serviceId }).from(serviceComments).where(eq(serviceComments.id, report.commentId)).limit(1); if (!comment || comment.serviceId !== input.serviceId) throw new ActionError({ code: "FORBIDDEN", message: t.admin.errors.forbidden }); }
  if (report.reviewId) { const [review] = await db.select({ serviceId: serviceReviews.serviceId }).from(serviceReviews).where(eq(serviceReviews.id, report.reviewId)).limit(1); if (!review || review.serviceId !== input.serviceId) throw new ActionError({ code: "FORBIDDEN", message: t.admin.errors.forbidden }); }
  await db.update(serviceReports).set({ status: input.status, resolvedBy: user.id, resolvedAt: new Date() }).where(eq(serviceReports.id, input.id));
  auditService(context, user.id, "SERVICE_REPORT_RESOLVE", { resource: "serviceReports", resourceId: input.id, metadata: { status: input.status, organizationId: tenant.organizationId } }); return { success: true };
} });
