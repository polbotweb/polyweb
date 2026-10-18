/**
 * Actions groupées des services sur le moteur générique core/bulk : mêmes transitions que les
 * actions unitaires (workflow SERVICE_WORKFLOW), tout ou rien, périmètre tenant, verrous
 * d'édition, une transaction, audit par service (batchId commun), cache invalidé après commit.
 */
import { Effect } from "effect";
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { services } from "@database/schemas";
import { BulkActionError, DEFAULT_BULK_MAX_ITEMS, runBulkAction, type BulkOperationDefinition } from "@/core/bulk";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { ActionFailure, actionTry, effectHandler } from "@/lib/effect/action";
import type { AuditAction } from "@/lib/audit";
import { serviceLock } from "@/modules/services/locks";
import { requireServicePermission, resolveServiceTenant, serviceOrganizationIdSchema } from "@/modules/services/permissions";
import { canTransitionService } from "@/modules/services/workflow";
import type { ServiceStatus } from "@/modules/services/domain";
import { auditService, invalidateServicesCache } from "./_helpers";

type ServiceRow = typeof services.$inferSelect;
type ServicesDb = ReturnType<typeof getDrizzle>;
type ServicesTx = Parameters<Parameters<ServicesDb["transaction"]>[0]>[0];
type Actor = { id: string };

export const SERVICE_BULK_OPERATIONS = ["publish", "unpublish", "archive", "restore", "delete"] as const;
export type ServiceBulkOperation = (typeof SERVICE_BULK_OPERATIONS)[number];

const TARGET: Record<ServiceBulkOperation, ServiceStatus> = { publish: "PUBLISHED", unpublish: "DRAFT", archive: "ARCHIVED", restore: "DRAFT", delete: "DELETED" };
const PERMISSION: Record<ServiceBulkOperation, "publish" | "update" | "delete"> = { publish: "publish", unpublish: "publish", archive: "update", restore: "update", delete: "delete" };
const AUDIT: Record<ServiceBulkOperation, AuditAction> = { publish: "SERVICE_PUBLISH", unpublish: "SERVICE_UNPUBLISH", archive: "SERVICE_ARCHIVE", restore: "SERVICE_RESTORE", delete: "SERVICE_DELETE" };

const transition = (op: ServiceBulkOperation): BulkOperationDefinition<ServiceRow, ServicesTx, Actor> => ({
  validate: (row) => (canTransitionService(row.status as ServiceStatus, TARGET[op]) ? null : `Transition ${row.status} → ${TARGET[op]} impossible pour « ${row.slug} ».`),
  apply: async (tx, row, actor) => {
    await tx.update(services).set({ status: TARGET[op], publishedAt: TARGET[op] === "PUBLISHED" ? new Date() : null, updatedBy: actor.id }).where(eq(services.id, row.id));
  },
  auditAction: AUDIT[op],
  auditMetadata: (row) => ({ organizationId: row.organizationId ?? null, from: row.status, to: TARGET[op] }),
  destructive: op === "delete",
  confirmationKey: op === "delete" || op === "archive" ? `services.bulk.${op}` : undefined,
});

/** Définitions exportées pour l'UI (confirmation requise ou non : bulkOperationUi). */
export const serviceBulkOperations = Object.fromEntries(SERVICE_BULK_OPERATIONS.map((op) => [op, transition(op)])) as Record<ServiceBulkOperation, BulkOperationDefinition<ServiceRow, ServicesTx, Actor>>;

export const bulkServiceLifecycle = defineAction({
  input: z.object({
    ids: z.array(z.uuid()).min(1).max(DEFAULT_BULK_MAX_ITEMS),
    organizationId: serviceOrganizationIdSchema,
    operation: z.enum(SERVICE_BULK_OPERATIONS),
  }),
  handler: effectHandler((input, context) => {
    const tenant = resolveServiceTenant({ organizationId: input.organizationId });
    const db = getDrizzle();
    const inTenant = tenant.organizationId === null ? isNull(services.organizationId) : eq(services.organizationId, tenant.organizationId);
    return runBulkAction({
      resource: "services",
      operations: serviceBulkOperations,
      authorize: (op: ServiceBulkOperation) => requireServicePermission(context, tenant, { service: [PERMISSION[op]] }).pipe(Effect.map((u) => ({ id: u.id }))),
      // Hors tenant → absent du chargement → FORBIDDEN (moteur).
      load: (ids) => actionTry("services/bulk.load", () => db.select().from(services).where(and(inTenant, inArray(services.id, [...ids])))),
      guard: (ids, actor) => serviceLock.ensureNoneLockedByOther(ids, lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
      transaction: (body) => db.transaction((tx) => body(tx)),
      audit: (actor, action, entry) => auditService(context, actor.id, action as AuditAction, entry),
      afterCommit: () => invalidateServicesCache(),
    }, { ids: input.ids, operation: input.operation }).pipe(
      Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)),
      Effect.map((r) => ({ updated: r.updated, batchId: r.batchId })),
    );
  }),
});
