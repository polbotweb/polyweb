import { ActionError } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { mediaFiles, serviceCategories, serviceLocks, serviceTags, services } from "@database/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import type { statement } from "@/lib/permissions";

export type ServicePermissions = { [K in keyof typeof statement]?: (typeof statement)[K][number][] };
export interface ServiceTenantContext { organizationId: string | null; isOrgContext: boolean; }
export const serviceOrganizationIdSchema = z.string().trim().min(1).optional().nullable();

export function resolveServiceTenant(input: { organizationId?: string | null }): ServiceTenantContext {
  return { organizationId: input.organizationId ?? null, isOrgContext: Boolean(input.organizationId) };
}

export async function hasServicePermission(context: Pick<ActionAPIContext, "locals" | "request">, tenant: ServiceTenantContext, permissions: ServicePermissions): Promise<boolean> {
  const currentUser = context.locals.user;
  if (!currentUser || currentUser.banned) return false;
  try {
    const { auth } = await import("@/lib/auth");
    if (tenant.isOrgContext) {
      const result = await auth.api.hasPermission({ headers: context.request.headers, body: { organizationId: tenant.organizationId!, permissions: permissions as Record<string, string[]> } });
      return result.success;
    }
    const result = await auth.api.userHasPermission({ body: { userId: currentUser.id, permissions: permissions as Record<string, string[]> } });
    return result.success;
  } catch {
    return false;
  }
}

export async function assertServicePermission(context: ActionAPIContext, tenant: ServiceTenantContext, permissions: ServicePermissions) {
  const currentUser = context.locals.user;
  if (!currentUser) throw new ActionError({ code: "UNAUTHORIZED", message: "Vous devez être connecté pour effectuer cette action." });
  if (currentUser.banned) throw new ActionError({ code: "FORBIDDEN", message: "Compte suspendu." });
  if (!(await hasServicePermission(context, tenant, permissions))) throw new ActionError({ code: "FORBIDDEN", message: "Permissions insuffisantes." });
  return currentUser;
}

export async function assertServiceInTenant(serviceId: string, tenant: ServiceTenantContext) {
  const [service] = await getDrizzle().select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!service) throw new ActionError({ code: "NOT_FOUND", message: "Service introuvable." });
  if ((service.organizationId ?? null) !== tenant.organizationId) throw new ActionError({ code: "FORBIDDEN", message: "Ce service n'appartient pas à ce tenant." });
  return service;
}

export async function assertPublishedServiceInTenant(serviceId: string, tenant: ServiceTenantContext) {
  const service = await assertServiceInTenant(serviceId, tenant);
  if (service.status !== "PUBLISHED") throw new ActionError({ code: "NOT_FOUND", message: "Service introuvable." });
  return service;
}

export async function assertServiceLockOwner(serviceId: string, userId: string, sessionId: string | null | undefined) {
  const [lock] = await getDrizzle().select({ userId: serviceLocks.userId, sessionId: serviceLocks.sessionId, expiresAt: serviceLocks.expiresAt }).from(serviceLocks).where(eq(serviceLocks.serviceId, serviceId)).limit(1);
  if (!lock || lock.expiresAt <= new Date()) return;
  if (lock.userId !== userId || (sessionId && lock.sessionId !== sessionId)) throw new ActionError({ code: "CONFLICT", message: "Ce service est actuellement verrouillé par un autre éditeur." });
}

export async function assertServiceCategoryInTenant(categoryId: string, tenant: ServiceTenantContext) {
  const [category] = await getDrizzle().select().from(serviceCategories).where(eq(serviceCategories.id, categoryId)).limit(1);
  if (!category) throw new ActionError({ code: "NOT_FOUND", message: "Catégorie introuvable." });
  if ((category.organizationId ?? null) !== tenant.organizationId) throw new ActionError({ code: "FORBIDDEN", message: "Cette catégorie n'appartient pas à ce tenant." });
  return category;
}

export async function assertServiceTagInTenant(tagId: string, tenant: ServiceTenantContext) {
  const [tag] = await getDrizzle().select().from(serviceTags).where(eq(serviceTags.id, tagId)).limit(1);
  if (!tag) throw new ActionError({ code: "NOT_FOUND", message: "Tag introuvable." });
  if ((tag.organizationId ?? null) !== tenant.organizationId) throw new ActionError({ code: "FORBIDDEN", message: "Ce tag n'appartient pas à ce tenant." });
  return tag;
}

export async function assertServiceMediaInTenant(mediaId: string, tenant: ServiceTenantContext) {
  const [media] = await getDrizzle().select().from(mediaFiles).where(eq(mediaFiles.id, mediaId)).limit(1);
  if (!media) throw new ActionError({ code: "NOT_FOUND", message: "Média introuvable." });
  if ((media.organizationId ?? null) !== tenant.organizationId) throw new ActionError({ code: "FORBIDDEN", message: "Ce média n'appartient pas à ce tenant." });
  return media;
}

export function serviceRateLimit(_context: ActionAPIContext, userId: string, scope: string) {
  const result = checkRateLimit(`service-${scope.replace(/:/g, "_")}:${userId}`, { window: 60, max: 30 });
  if (!result.allowed) throw new ActionError({ code: "TOO_MANY_REQUESTS", message: "Trop de requêtes. Veuillez réessayer dans quelques instants." });
}
