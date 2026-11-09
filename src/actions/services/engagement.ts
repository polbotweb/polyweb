import { Effect } from "effect";
import { and, count, desc, eq } from "drizzle-orm";
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { serviceComments, serviceFavorites, serviceReviews, serviceReviewHelpful } from "@database/schemas";
import { sanitizeHtml } from "@lib/sanitize";
import { stripHtml } from "@/core/content/text";
import type { Locale } from "@i18n/config";
import { isValidLocale } from "@i18n/utils";
import { getServiceNotificationTranslations } from "@/modules/services/i18n/notifications";
import { getServiceTranslations } from "@/modules/services/i18n";
import { serviceReportSchema } from "@/modules/services/validation";
import { resolveServiceTenant, serviceOrganizationIdSchema } from "./_helpers";
import { auditService, invalidateServicesCache } from "./_helpers";
import { createServiceNotification } from "./notification";
import { actionTry, effectHandler, fail } from "@/lib/effect/action";
import { reportModerationTarget } from "@/actions/moderation";
import { publishedServiceInTenant, requireServicePermission, serviceRateLimitEffect } from "@/modules/services/permissions";

const serviceIdInput = z.object({ serviceId: z.uuid(), organizationId: serviceOrganizationIdSchema });
function requestLocale(headers: Headers): Locale { const candidate = headers.get("accept-language")?.split(",", 1)[0]?.split("-", 1)[0] ?? "fr"; return isValidLocale(candidate) ? candidate : "fr"; }

export const toggleServiceFavorite = defineAction({ input: serviceIdInput, handler: effectHandler((input, context) => Effect.gen(function* () {
  const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { service: ["read"] }); yield* publishedServiceInTenant(input.serviceId, tenant); yield* serviceRateLimitEffect(user.id, "favorite"); return yield* actionTry("services/engagement.toggleServiceFavorite", async () => {
  const db = getDrizzle(); const existing = (await db.select().from(serviceFavorites).where(and(eq(serviceFavorites.serviceId, input.serviceId), eq(serviceFavorites.userId, user.id))).limit(1))[0];
  if (existing) { await db.delete(serviceFavorites).where(and(eq(serviceFavorites.serviceId, input.serviceId), eq(serviceFavorites.userId, user.id))); auditService(context, user.id, "SERVICE_FAVORITE_REMOVE", { resource: "services", resourceId: input.serviceId }); invalidateServicesCache(); return { active: false }; }
  await db.insert(serviceFavorites).values({ serviceId: input.serviceId, userId: user.id }); auditService(context, user.id, "SERVICE_FAVORITE_ADD", { resource: "services", resourceId: input.serviceId }); invalidateServicesCache(); return { active: true };
}); })) });

export const createServiceReview = defineAction({
  input: serviceIdInput.extend({ rating: z.coerce.number().int().min(1).max(5), title: z.string().trim().max(180).optional(), content: z.string().trim().min(1).max(5000), isRecommended: z.boolean().default(true) }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { service: ["read"] }); const service = yield* publishedServiceInTenant(input.serviceId, tenant); yield* serviceRateLimitEffect(user.id, "review"); return yield* actionTry("services/engagement.createServiceReview", async () => {
    const db = getDrizzle(); const existing = (await db.select().from(serviceReviews).where(and(eq(serviceReviews.serviceId, input.serviceId), eq(serviceReviews.authorId, user.id))).limit(1))[0]; const locale = requestLocale(context.request.headers); const t = getServiceTranslations(locale);
    if (existing) throw new ActionError({ code: "CONFLICT", message: t.admin.errors.conflict });
    const title = input.title ? stripHtml(input.title).trim() : null; const content = sanitizeHtml(input.content); if (!content.trim()) throw new ActionError({ code: "BAD_REQUEST", message: t.admin.errors.badRequest });
    const [review] = await db.insert(serviceReviews).values({ serviceId: input.serviceId, authorId: user.id, rating: input.rating, title, content, isRecommended: input.isRecommended, status: "PENDING" }).returning({ id: serviceReviews.id });
    if (review?.id) { const nt = getServiceNotificationTranslations(locale); await createServiceNotification({ recipientId: service.providerId, serviceId: input.serviceId, actorId: user.id, type: "NEW_REVIEW", reviewId: review.id, title: nt.reviewTitle, message: nt.reviewMessage, locale }); }
    auditService(context, user.id, "SERVICE_REVIEW_CREATE", { resource: "serviceReviews", resourceId: review.id, metadata: { organizationId: tenant.organizationId } }); invalidateServicesCache(); return review;
  }); })),
});

export const createServiceComment = defineAction({
  input: serviceIdInput.extend({ parentId: z.uuid().optional().nullable(), content: z.string().trim().min(1).max(5000) }),
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { service: ["read"] }); const service = yield* publishedServiceInTenant(input.serviceId, tenant); yield* serviceRateLimitEffect(user.id, "comment"); return yield* actionTry("services/engagement.createServiceComment", async () => {
    const db = getDrizzle(); const locale = requestLocale(context.request.headers); let recipientId = service.providerId; let type: "NEW_COMMENT" | "REPLY_TO_COMMENT" = "NEW_COMMENT";
    if (input.parentId) { const [parent] = await db.select({ id: serviceComments.id, authorId: serviceComments.authorId }).from(serviceComments).where(and(eq(serviceComments.id, input.parentId), eq(serviceComments.serviceId, input.serviceId))).limit(1); if (!parent) throw new ActionError({ code: "NOT_FOUND", message: getServiceTranslations(locale).admin.errors.notFound }); if (parent.authorId) { recipientId = parent.authorId; type = "REPLY_TO_COMMENT"; } }
    const content = sanitizeHtml(input.content); if (!content.trim()) throw new ActionError({ code: "BAD_REQUEST", message: getServiceTranslations(locale).admin.errors.badRequest });
    const [comment] = await db.insert(serviceComments).values({ serviceId: input.serviceId, authorId: user.id, parentId: input.parentId ?? null, content, status: "PENDING" }).returning({ id: serviceComments.id });
    if (comment?.id) { const nt = getServiceNotificationTranslations(locale); await createServiceNotification({ recipientId, serviceId: input.serviceId, actorId: user.id, type, commentId: comment.id, title: type === "NEW_COMMENT" ? nt.commentTitle : nt.commentReplyTitle, message: nt.contributionPending, locale }); }
    auditService(context, user.id, "SERVICE_COMMENT_CREATE", { resource: "serviceComments", resourceId: comment.id, metadata: { organizationId: tenant.organizationId } }); invalidateServicesCache(); return comment;
  }); })),
});

/**
 * Façade historique du signalement services : vérifications propres au module (lecture du service
 * publié dans le tenant, rattachement de la cible) puis signalement générique dédoublonné
 * (`moderation.report`, docs/moderation.md). Aucun identifiant de signalement n'est renvoyé.
 */
export const createServiceReport = defineAction({
  input: serviceReportSchema,
  handler: effectHandler((input, context) => Effect.gen(function* () {
    const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { service: ["read"] }); yield* publishedServiceInTenant(input.serviceId, tenant); yield* serviceRateLimitEffect(user.id, "report");
    const t = getServiceTranslations(requestLocale(context.request.headers));
    const [type, id] = input.commentId ? ["comment", input.commentId] : ["review", input.reviewId ?? ""];
    const owner = yield* actionTry("services/engagement.createServiceReport", () => {
      const db = getDrizzle();
      return type === "comment"
        ? db.select({ id: serviceComments.id }).from(serviceComments).where(and(eq(serviceComments.id, id), eq(serviceComments.serviceId, input.serviceId))).limit(1)
        : db.select({ id: serviceReviews.id }).from(serviceReviews).where(and(eq(serviceReviews.id, id), eq(serviceReviews.serviceId, input.serviceId))).limit(1);
    });
    if (owner.length === 0) return yield* fail("NOT_FOUND", t.admin.errors.notFound);
    yield* reportModerationTarget({ target: `services.${type}`, id, reason: input.reason.toLowerCase() as "spam", description: input.description ?? null }, context);
    return { success: true };
  })),
});

export const voteServiceReviewHelpful = defineAction({ input: serviceIdInput.extend({ reviewId: z.uuid(), isHelpful: z.boolean() }), handler: effectHandler((input, context) => Effect.gen(function* () {
  const tenant = resolveServiceTenant(input); const user = yield* requireServicePermission(context, tenant, { serviceReview: ["read"] }); yield* publishedServiceInTenant(input.serviceId, tenant); yield* serviceRateLimitEffect(user.id, "review-helpful"); return yield* actionTry("services/engagement.voteServiceReviewHelpful", async () => {
  const db = getDrizzle(); const [review] = await db.select({ id: serviceReviews.id }).from(serviceReviews).where(and(eq(serviceReviews.id, input.reviewId), eq(serviceReviews.serviceId, input.serviceId), eq(serviceReviews.status, "APPROVED"))).limit(1); if (!review) throw new ActionError({ code: "NOT_FOUND", message: getServiceTranslations(requestLocale(context.request.headers)).admin.errors.notFound });
  await db.insert(serviceReviewHelpful).values({ reviewId: input.reviewId, userId: user.id, isHelpful: input.isHelpful }).onConflictDoUpdate({ target: [serviceReviewHelpful.reviewId, serviceReviewHelpful.userId], set: { isHelpful: input.isHelpful } });
  const [aggregate] = await db.select({ count: count() }).from(serviceReviewHelpful).where(and(eq(serviceReviewHelpful.reviewId, input.reviewId), eq(serviceReviewHelpful.isHelpful, true))); const helpfulCount = Number(aggregate?.count ?? 0); await db.update(serviceReviews).set({ helpfulCount }).where(eq(serviceReviews.id, input.reviewId));
  auditService(context, user.id, "SERVICE_REVIEW_HELPFUL", { resource: "serviceReviews", resourceId: input.reviewId, metadata: { isHelpful: input.isHelpful, helpfulCount } }); invalidateServicesCache(); return { success: true, helpfulCount };
}); })) });