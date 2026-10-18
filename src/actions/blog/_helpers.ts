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

export async function hasBlogPermission(context: BlogPermissionContext, tenant: BlogTenantContext, permissions: BlogPermissions): Promise<boolean> {
  const user = context.locals.user;
  if (!user || user.banned) return false;
  try {
    const { auth } = await import("@/lib/auth");
    if (tenant.isOrgContext) {
      const result = await auth.api.hasPermission({ headers: context.request.headers, body: { organizationId: tenant.organizationId!, permissions: permissions as Record<string, string[]> } });
      return result.success;
    }
    const result = await auth.api.userHasPermission({ body: { userId: user.id, permissions: permissions as Record<string, string[]> } });
    return result.success;
  } catch {
    return false;
  }
}

export async function assertBlogPermission(context: ActionAPIContext, tenant: BlogTenantContext, permissions: BlogPermissions) {
  const user = context.locals.user;
  if (!user) throw new ActionError({ code: "UNAUTHORIZED", message: "Vous devez être connecté pour effectuer cette action." });
  if (user.banned) throw new ActionError({ code: "FORBIDDEN", message: "Compte suspendu." });
  if (!(await hasBlogPermission(context, tenant, permissions))) throw new ActionError({ code: "FORBIDDEN", message: "Permissions insuffisantes." });
  return user;
}

export async function assertPostInTenant(postId: string, tenant: BlogTenantContext) {
  const [post] = await getDrizzle().select().from(blogPosts).where(eq(blogPosts.id, postId)).limit(1);
  if (!post) throw new ActionError({ code: "NOT_FOUND", message: "Article introuvable." });
  if ((post.organizationId ?? null) !== tenant.organizationId) throw new ActionError({ code: "FORBIDDEN", message: "Cet article n'appartient pas à ce tenant." });
  return post;
}

export async function assertCategoryInTenant(categoryId: string, tenant: BlogTenantContext) {
  const [category] = await getDrizzle().select({ id: blogCategories.id, organizationId: blogCategories.organizationId }).from(blogCategories).where(eq(blogCategories.id, categoryId)).limit(1);
  if (!category) throw new ActionError({ code: "NOT_FOUND", message: "Catégorie introuvable." });
  if ((category.organizationId ?? null) !== tenant.organizationId) throw new ActionError({ code: "FORBIDDEN", message: "Cette catégorie n'appartient pas à ce tenant." });
  return category;
}

export async function assertTagInTenant(tagId: string, tenant: BlogTenantContext) {
  const [tag] = await getDrizzle().select({ id: blogTags.id, organizationId: blogTags.organizationId }).from(blogTags).where(eq(blogTags.id, tagId)).limit(1);
  if (!tag) throw new ActionError({ code: "NOT_FOUND", message: "Tag introuvable." });
  if ((tag.organizationId ?? null) !== tenant.organizationId) throw new ActionError({ code: "FORBIDDEN", message: "Ce tag n'appartient pas à ce tenant." });
  return tag;
}

export async function assertMediaInTenant(mediaId: string, tenant: BlogTenantContext) {
  const [media] = await getDrizzle().select({ id: mediaFiles.id, organizationId: mediaFiles.organizationId }).from(mediaFiles).where(eq(mediaFiles.id, mediaId)).limit(1);
  if (!media) throw new ActionError({ code: "NOT_FOUND", message: "Média introuvable." });
  if ((media.organizationId ?? null) !== tenant.organizationId) throw new ActionError({ code: "FORBIDDEN", message: "Ce média n'appartient pas à ce tenant." });
  return media;
}

export function blogRateLimit(_context: ActionAPIContext, userId: string, scope: string, opts = { window: 60, max: 30 }) {
  const rl = checkRateLimit(`blog-${scope.replace(/:/g, "_")}:${userId}`, opts);
  if (!rl.allowed) throw new ActionError({ code: "TOO_MANY_REQUESTS", message: "Trop de requêtes. Veuillez réessayer dans quelques instants." });
}

export function blogPublicRateLimit(context: ActionAPIContext, scope: string, opts = { window: 300, max: 5 }) {
  const ip = extractIp(context.request.headers, context.clientAddress);
  const key = ip ? `blog-${scope.replace(/:/g, "_")}:${ip}` : `blog-${scope.replace(/:/g, "_")}:__global__`;
  const rl = checkRateLimit(key, ip ? opts : { window: opts.window, max: Math.max(1, Math.floor(opts.max / 3)) });
  if (!rl.allowed) throw new ActionError({ code: "TOO_MANY_REQUESTS", message: "Trop de requêtes. Veuillez réessayer dans quelques instants." });
}

export function auditBlog(context: ActionAPIContext, userId: string, action: AuditAction, opts?: { resource?: string; resourceId?: string; metadata?: Record<string, unknown> }) {
  void logAuditEvent({ userId, action, resource: opts?.resource ?? null, resourceId: opts?.resourceId ?? null, metadata: opts?.metadata ?? null, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }).catch(() => {});
}

export function invalidateBlogCache() {
  for (const prefix of ["blog:post:", "blog:list:", "blog:related:", "blog:author:", "blog:categories:", "blog:category:", "blog:tags:", "blog:tag:", "blog:slugs:", "blog:link-targets:"]) invalidateCache(prefix);
}
