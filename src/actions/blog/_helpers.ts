import { Effect } from "effect";
import { actionTry, fail, runGuard } from "@/lib/effect/action";
import { ActionError } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { blogPosts, blogCategories, blogTags, mediaFiles } from "@database/schemas";
import { logAuditEvent, extractIp, type AuditAction } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { invalidateCache } from "@database/cache";
import type { statement } from "@/lib/permissions";

type Statement = typeof statement;
export type BlogPermissions = { [K in keyof Statement]?: Statement[K][number][] };
type BlogPermissionContext = Pick<ActionAPIContext, "locals" | "request">;

export interface BlogTenantContext { organizationId: string | null; isOrgContext: boolean; }
export const blogOrganizationIdSchema = z.string().trim().min(1).optional().nullable();

export function resolveBlogTenant(input: { organizationId?: string | null }): BlogTenantContext {
  return { organizationId: input.organizationId ?? null, isOrgContext: Boolean(input.organizationId) };
}

// Gardes tenant/RBAC du blog en Effect (échecs `ActionFailure`, infrastructure `OperationError`) ;
// les `assert*` / `has*` historiques sont des adaptateurs Promise via `runGuard`.

/** RBAC organisation (better-auth `hasPermission`) ou global (`userHasPermission`) ; toute erreur → refus. */
export const hasBlogPermissionEffect = (context: BlogPermissionContext, tenant: BlogTenantContext, permissions: BlogPermissions): Effect.Effect<boolean> => {
  const user = context.locals.user;
  if (!user || user.banned) return Effect.succeed(false);
  return Effect.tryPromise(async () => {
    const { auth } = await import("@/lib/auth");
    if (tenant.isOrgContext) {
      const result = await auth.api.hasPermission({ headers: context.request.headers, body: { organizationId: tenant.organizationId!, permissions: permissions as Record<string, string[]> } });
      return result.success;
    }
    const result = await auth.api.userHasPermission({ body: { userId: user.id, permissions: permissions as Record<string, string[]> } });
    return result.success;
  }).pipe(Effect.orElseSucceed(() => false));
};

export const requireBlogPermission = (context: BlogPermissionContext, tenant: BlogTenantContext, permissions: BlogPermissions) =>
  Effect.gen(function* () {
    const user = context.locals.user;
    if (!user) return yield* fail("UNAUTHORIZED", "Vous devez être connecté pour effectuer cette action.");
    if (user.banned) return yield* fail("FORBIDDEN", "Compte suspendu.");
    if (!(yield* hasBlogPermissionEffect(context, tenant, permissions))) return yield* fail("FORBIDDEN", "Permissions insuffisantes.");
    return user;
  });

const ownedBy = <T extends { organizationId: string | null }>(op: string, missing: string, foreign: string, load: () => Promise<T[]>, tenant: BlogTenantContext) =>
  Effect.gen(function* () {
    const [item] = yield* actionTry(op, load);
    if (!item) return yield* fail("NOT_FOUND", missing);
    if ((item.organizationId ?? null) !== tenant.organizationId) return yield* fail("FORBIDDEN", foreign);
    return item;
  });

export const postInTenant = (postId: string, tenant: BlogTenantContext) =>
  ownedBy("blog.post.tenant", "Article introuvable.", "Cet article n'appartient pas à ce tenant.", () => getDrizzle().select().from(blogPosts).where(eq(blogPosts.id, postId)).limit(1), tenant);
export const categoryInTenant = (categoryId: string, tenant: BlogTenantContext) =>
  ownedBy("blog.category.tenant", "Catégorie introuvable.", "Cette catégorie n'appartient pas à ce tenant.", () => getDrizzle().select({ id: blogCategories.id, organizationId: blogCategories.organizationId }).from(blogCategories).where(eq(blogCategories.id, categoryId)).limit(1), tenant);
export const tagInTenant = (tagId: string, tenant: BlogTenantContext) =>
  ownedBy("blog.tag.tenant", "Tag introuvable.", "Ce tag n'appartient pas à ce tenant.", () => getDrizzle().select({ id: blogTags.id, organizationId: blogTags.organizationId }).from(blogTags).where(eq(blogTags.id, tagId)).limit(1), tenant);
export const mediaInTenant = (mediaId: string, tenant: BlogTenantContext) =>
  ownedBy("blog.media.tenant", "Média introuvable.", "Ce média n'appartient pas à ce tenant.", () => getDrizzle().select({ id: mediaFiles.id, organizationId: mediaFiles.organizationId }).from(mediaFiles).where(eq(mediaFiles.id, mediaId)).limit(1), tenant);

const TOO_MANY = "Trop de requêtes. Veuillez réessayer dans quelques instants.";
export const blogRateLimitEffect = (userId: string, scope: string, opts = { window: 60, max: 30 }) =>
  Effect.suspend(() => (checkRateLimit(`blog-${scope.replace(/:/g, "_")}:${userId}`, opts).allowed ? Effect.void : fail("TOO_MANY_REQUESTS", TOO_MANY)));
export const blogPublicRateLimitEffect = (context: Pick<ActionAPIContext, "request" | "clientAddress">, scope: string, opts = { window: 300, max: 5 }) =>
  Effect.suspend(() => {
    const ip = extractIp(context.request.headers, context.clientAddress);
    const key = ip ? `blog-${scope.replace(/:/g, "_")}:${ip}` : `blog-${scope.replace(/:/g, "_")}:__global__`;
    return checkRateLimit(key, ip ? opts : { window: opts.window, max: Math.max(1, Math.floor(opts.max / 3)) }).allowed ? Effect.void : fail("TOO_MANY_REQUESTS", TOO_MANY);
  });

// ─── Adaptateurs Promise ──────────────────────────────────────────────────────
export const hasBlogPermission = (context: BlogPermissionContext, tenant: BlogTenantContext, permissions: BlogPermissions): Promise<boolean> => Effect.runPromise(hasBlogPermissionEffect(context, tenant, permissions));
export const assertBlogPermission = (context: ActionAPIContext, tenant: BlogTenantContext, permissions: BlogPermissions) => runGuard(requireBlogPermission(context, tenant, permissions));
export const assertPostInTenant = (postId: string, tenant: BlogTenantContext) => runGuard(postInTenant(postId, tenant));
export const assertCategoryInTenant = (categoryId: string, tenant: BlogTenantContext) => runGuard(categoryInTenant(categoryId, tenant));
export const assertTagInTenant = (tagId: string, tenant: BlogTenantContext) => runGuard(tagInTenant(tagId, tenant));
export const assertMediaInTenant = (mediaId: string, tenant: BlogTenantContext) => runGuard(mediaInTenant(mediaId, tenant));
export function blogRateLimit(_context: ActionAPIContext, userId: string, scope: string, opts = { window: 60, max: 30 }) {
  if (!checkRateLimit(`blog-${scope.replace(/:/g, "_")}:${userId}`, opts).allowed) throw new ActionError({ code: "TOO_MANY_REQUESTS", message: TOO_MANY });
}
export function blogPublicRateLimit(context: ActionAPIContext, scope: string, opts = { window: 300, max: 5 }) {
  const ip = extractIp(context.request.headers, context.clientAddress);
  const key = ip ? `blog-${scope.replace(/:/g, "_")}:${ip}` : `blog-${scope.replace(/:/g, "_")}:__global__`;
  if (!checkRateLimit(key, ip ? opts : { window: opts.window, max: Math.max(1, Math.floor(opts.max / 3)) }).allowed) throw new ActionError({ code: "TOO_MANY_REQUESTS", message: TOO_MANY });
}

export function auditBlog(context: ActionAPIContext, userId: string, action: AuditAction, opts?: { resource?: string; resourceId?: string; metadata?: Record<string, unknown> }) {
  void logAuditEvent({ userId, action, resource: opts?.resource ?? null, resourceId: opts?.resourceId ?? null, metadata: opts?.metadata ?? null, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }).catch(() => {});
}

export function invalidateBlogCache() {
  for (const prefix of ["blog:post:", "blog:list:", "blog:related:", "blog:author:", "blog:categories:", "blog:category:", "blog:tags:", "blog:tag:", "blog:slugs:", "blog:link-targets:"]) invalidateCache(prefix);
}
