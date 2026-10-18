export {
  resolveServiceTenant,
  assertServicePermission,
  assertServiceInTenant,
  assertPublishedServiceInTenant,
  assertServiceCategoryInTenant,
  assertServiceTagInTenant,
  assertServiceMediaInTenant,
  hasServicePermission,
  serviceOrganizationIdSchema,
  serviceRateLimit,
} from "@/modules/services/permissions";

import { ActionError, type ActionAPIContext } from "astro:actions";
import { and, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { serviceLocks } from "@database/schemas";
import { logAuditEvent, extractIp, type AuditAction } from "@/lib/audit";
import { invalidateCache } from "@database/cache";

export async function assertServiceLockOwner(serviceId: string, userId: string, sessionId?: string | null): Promise<void> {
  const [lock] = await getDrizzle().select().from(serviceLocks).where(eq(serviceLocks.serviceId, serviceId)).limit(1);
  if (!lock) return;
  if (lock.expiresAt <= new Date()) {
    await getDrizzle().delete(serviceLocks).where(eq(serviceLocks.serviceId, serviceId));
    return;
  }
  if (lock.userId !== userId || (sessionId != null && lock.sessionId !== sessionId)) {
    throw new ActionError({ code: "CONFLICT", message: "Ce service est verrouillé par un autre éditeur." });
  }
}

export function auditService(context: ActionAPIContext, userId: string, action: AuditAction, opts?: { resource?: string; resourceId?: string; metadata?: Record<string, unknown> }) {
  void logAuditEvent({ userId, action, resource: opts?.resource ?? null, resourceId: opts?.resourceId ?? null, metadata: opts?.metadata ?? null, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }).catch(() => {});
}

export function invalidateServicesCache() {
  for (const prefix of ["services:service:", "services:list:", "services:category:", "services:categories:", "services:tags:", "services:search:"]) invalidateCache(prefix);
}
