import { Effect, Exit } from "effect";
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { z } from "astro/zod";
import { getDrizzle } from "@database/drizzle";
import { mediaFiles, serviceCategories, serviceLocks, serviceTags, services } from "@database/schemas";
import { checkRateLimit } from "@/lib/rate-limit";
import { actionTry, fail, toActionError, type ActionFailure } from "@/lib/effect/action";
import type { OperationError } from "@/lib/effect/errors";
import type { statement } from "@/lib/permissions";

export type ServicePermissions = { [K in keyof typeof statement]?: (typeof statement)[K][number][] };
export interface ServiceTenantContext { organizationId: string | null; isOrgContext: boolean; }
export const serviceOrganizationIdSchema = z.string().trim().min(1).optional().nullable();

/**
 * Garde-fous tenant/RBAC du module services, en Effect : échecs `ActionFailure`
 * (code + message UI) ou `OperationError` (infrastructure). Les fonctions
 * `assert*` historiques sont des adaptateurs Promise qui relèvent `ActionError`.
 */
type GuardError = ActionFailure | OperationError;

const row = <A>(operation: string, f: () => Promise<A[]>) => actionTry(operation, f).pipe(Effect.map((rows) => rows[0]));

/** Exécute une garde Effect et relève l'erreur sous forme d'`ActionError` (adaptateur des appelants Promise). */
async function runGuard<A>(effect: Effect.Effect<A, GuardError>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const reason = exit.cause.reasons.find((r) => r._tag === "Fail" || r._tag === "Die");
  throw toActionError(reason?._tag === "Fail" ? reason.error : reason?._tag === "Die" ? reason.defect : exit.cause);
}

export function resolveServiceTenant(input: { organizationId?: string | null }): ServiceTenantContext {
  return { organizationId: input.organizationId ?? null, isOrgContext: Boolean(input.organizationId) };
}

/** RBAC organisation (better-auth `hasPermission`) ou global (`userHasPermission`) ; toute erreur → refus. */
export const hasServicePermissionEffect = (context: Pick<ActionAPIContext, "locals" | "request">, tenant: ServiceTenantContext, permissions: ServicePermissions): Effect.Effect<boolean> => {
  const currentUser = context.locals.user;
  if (!currentUser || currentUser.banned) return Effect.succeed(false);
  return Effect.tryPromise(async () => {
    const { auth } = await import("@/lib/auth");
    if (tenant.isOrgContext) {
      const result = await auth.api.hasPermission({ headers: context.request.headers, body: { organizationId: tenant.organizationId!, permissions: permissions as Record<string, string[]> } });
      return result.success;
    }
    const result = await auth.api.userHasPermission({ body: { userId: currentUser.id, permissions: permissions as Record<string, string[]> } });
    return result.success;
  }).pipe(Effect.orElseSucceed(() => false));
};

export const requireServicePermission = (context: Pick<ActionAPIContext, "locals" | "request">, tenant: ServiceTenantContext, permissions: ServicePermissions) =>
  Effect.gen(function* () {
    const currentUser = context.locals.user;
    if (!currentUser) return yield* fail("UNAUTHORIZED", "Vous devez être connecté pour effectuer cette action.");
    if (currentUser.banned) return yield* fail("FORBIDDEN", "Compte suspendu.");
    if (!(yield* hasServicePermissionEffect(context, tenant, permissions))) return yield* fail("FORBIDDEN", "Permissions insuffisantes.");
    return currentUser;
  });

export const serviceInTenant = (serviceId: string, tenant: ServiceTenantContext) =>
  Effect.gen(function* () {
    const service = yield* row("services.tenant", () => getDrizzle().select().from(services).where(eq(services.id, serviceId)).limit(1));
    if (!service) return yield* fail("NOT_FOUND", "Service introuvable.");
    if ((service.organizationId ?? null) !== tenant.organizationId) return yield* fail("FORBIDDEN", "Ce service n'appartient pas à ce tenant.");
    return service;
  });

export const publishedServiceInTenant = (serviceId: string, tenant: ServiceTenantContext) =>
  serviceInTenant(serviceId, tenant).pipe(
    Effect.flatMap((service) => (service.status === "PUBLISHED" ? Effect.succeed(service) : fail("NOT_FOUND", "Service introuvable."))),
  );

export const serviceLockOwner = (serviceId: string, userId: string, sessionId: string | null | undefined) =>
  Effect.gen(function* () {
    const lock = yield* row("services.lock", () => getDrizzle().select({ userId: serviceLocks.userId, sessionId: serviceLocks.sessionId, expiresAt: serviceLocks.expiresAt }).from(serviceLocks).where(eq(serviceLocks.serviceId, serviceId)).limit(1));
    if (!lock || lock.expiresAt <= new Date()) return;
    if (lock.userId !== userId || (sessionId && lock.sessionId !== sessionId)) return yield* fail("CONFLICT", "Ce service est actuellement verrouillé par un autre éditeur.");
  });

const ownedBy = <T extends { organizationId: string | null }>(label: { op: string; missing: string; foreign: string }, load: () => Promise<T[]>, tenant: ServiceTenantContext) =>
  Effect.gen(function* () {
    const item = yield* row(label.op, load);
    if (!item) return yield* fail("NOT_FOUND", label.missing);
    if ((item.organizationId ?? null) !== tenant.organizationId) return yield* fail("FORBIDDEN", label.foreign);
    return item;
  });

export const serviceCategoryInTenant = (categoryId: string, tenant: ServiceTenantContext) =>
  ownedBy({ op: "services.category", missing: "Catégorie introuvable.", foreign: "Cette catégorie n'appartient pas à ce tenant." }, () => getDrizzle().select().from(serviceCategories).where(eq(serviceCategories.id, categoryId)).limit(1), tenant);

export const serviceTagInTenant = (tagId: string, tenant: ServiceTenantContext) =>
  ownedBy({ op: "services.tag", missing: "Tag introuvable.", foreign: "Ce tag n'appartient pas à ce tenant." }, () => getDrizzle().select().from(serviceTags).where(eq(serviceTags.id, tagId)).limit(1), tenant);

export const serviceMediaInTenant = (mediaId: string, tenant: ServiceTenantContext) =>
  ownedBy({ op: "services.media", missing: "Média introuvable.", foreign: "Ce média n'appartient pas à ce tenant." }, () => getDrizzle().select().from(mediaFiles).where(eq(mediaFiles.id, mediaId)).limit(1), tenant);

export const serviceRateLimitEffect = (userId: string, scope: string) =>
  Effect.suspend(() =>
    checkRateLimit(`service-${scope.replace(/:/g, "_")}:${userId}`, { window: 60, max: 30 }).allowed
      ? Effect.void
      : fail("TOO_MANY_REQUESTS", "Trop de requêtes. Veuillez réessayer dans quelques instants."),
  );

// ─── Adaptateurs Promise (appelants historiques) ──────────────────────────────

export const hasServicePermission = (context: Pick<ActionAPIContext, "locals" | "request">, tenant: ServiceTenantContext, permissions: ServicePermissions): Promise<boolean> =>
  Effect.runPromise(hasServicePermissionEffect(context, tenant, permissions));
export const assertServicePermission = (context: ActionAPIContext, tenant: ServiceTenantContext, permissions: ServicePermissions) => runGuard(requireServicePermission(context, tenant, permissions));
export const assertServiceInTenant = (serviceId: string, tenant: ServiceTenantContext) => runGuard(serviceInTenant(serviceId, tenant));
export const assertPublishedServiceInTenant = (serviceId: string, tenant: ServiceTenantContext) => runGuard(publishedServiceInTenant(serviceId, tenant));
export const assertServiceLockOwner = (serviceId: string, userId: string, sessionId: string | null | undefined) => runGuard(serviceLockOwner(serviceId, userId, sessionId));
export const assertServiceCategoryInTenant = (categoryId: string, tenant: ServiceTenantContext) => runGuard(serviceCategoryInTenant(categoryId, tenant));
export const assertServiceTagInTenant = (tagId: string, tenant: ServiceTenantContext) => runGuard(serviceTagInTenant(tagId, tenant));
export const assertServiceMediaInTenant = (mediaId: string, tenant: ServiceTenantContext) => runGuard(serviceMediaInTenant(mediaId, tenant));
export function serviceRateLimit(_context: ActionAPIContext, userId: string, scope: string): void {
  if (!checkRateLimit(`service-${scope.replace(/:/g, "_")}:${userId}`, { window: 60, max: 30 }).allowed) {
    throw toActionError({ _tag: "ActionFailure", code: "TOO_MANY_REQUESTS", message: "Trop de requêtes. Veuillez réessayer dans quelques instants." });
  }
}
