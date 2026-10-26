/**
 * Actions groupées du domaine logistics sur le moteur générique `src/core/bulk` : sélection
 * validée, permission, périmètre tenant (hors périmètre → FORBIDDEN), verrous d'édition,
 * transition par ligne (tout ou rien), une transaction, révision + audit par ligne.
 * Seules les transitions SANS effet de stock ni numérotation sont proposées en masse.
 * Ids alignés sur `admin/resource.ts` (`list.bulkActions`).
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { BulkActionError, DEFAULT_BULK_MAX_ITEMS, runBulkAction, type BulkOperationDefinition } from "@/core/bulk";
import { canTransition } from "@/core/workflow";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { logAuditEvent, extractIp } from "@/lib/audit";
import { ActionFailure, actionTry, effectHandler } from "@/lib/effect/action";
import { requireLogisticsPermission } from "../permissions";
import { logistics, logisticsShipmentRevisions } from "../schema";
import { logisticsLock } from "../locks";
import { shipmentWorkflow, type ShipmentStatus } from "../domain/workflow";

type Row = typeof logistics.$inferSelect;
type Db = ReturnType<typeof getDrizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Actor = { id: string };

/** Annuler des brouillons / prêtes, ou marquer livrées des expéditions parties. */
export const LOGISTICS_BULK_OPERATIONS = ["cancel", "deliver"] as const;
export type LogisticsBulkOperation = (typeof LOGISTICS_BULK_OPERATIONS)[number];

const TARGET: Record<LogisticsBulkOperation, ShipmentStatus> = { cancel: "CANCELLED", deliver: "DELIVERED" };

const transition = (op: LogisticsBulkOperation): BulkOperationDefinition<Row, Tx, Actor> => ({
  validate: (row) => (canTransition(shipmentWorkflow, row.status, TARGET[op]) ? null : "Transition invalide : " + row.status + " → " + TARGET[op] + "."),
  apply: async (tx, row, actor) => {
    await tx.update(logistics).set({ status: TARGET[op], ...(op === "deliver" ? { deliveredAt: new Date() } : {}) }).where(eq(logistics.id, row.id));
    await tx.insert(logisticsShipmentRevisions).values({ resourceId: row.id, authorId: actor.id, title: row.title, slug: row.slug, status: TARGET[op], note: "Action groupée : " + op });
  },
  auditAction: "BULK_ACTION",
  auditMetadata: (row) => ({ operation: op, from: row.status, to: TARGET[op] }),
  confirmationKey: op === "cancel" ? "logistics.bulk.cancel" : undefined,
});

export const bulkLogisticsLifecycle = defineAction({
  input: z.object({
    ids: z.array(z.uuid()).min(1).max(DEFAULT_BULK_MAX_ITEMS),
    organizationId: z.string().nullable().default(null),
    operation: z.enum(LOGISTICS_BULK_OPERATIONS),
  }),
  handler: effectHandler((input, context) => {
    const db = getDrizzle();
    const inTenant = input.organizationId === null ? isNull(logistics.organizationId) : eq(logistics.organizationId, input.organizationId);
    const operations = Object.fromEntries(LOGISTICS_BULK_OPERATIONS.map((op) => [op, transition(op)])) as Record<LogisticsBulkOperation, BulkOperationDefinition<Row, Tx, Actor>>;
    return runBulkAction({
      resource: "logistics",
      operations,
      authorize: () => requireLogisticsPermission(context, ["update"], input.organizationId).pipe(Effect.map((user) => ({ id: user.id }))),
      load: (ids) => actionTry("logistics.bulk.load", () => db.select().from(logistics).where(and(inTenant, inArray(logistics.id, [...ids])))),
      guard: (ids, actor) => logisticsLock.ensureNoneLockedByOther(ids, lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
      transaction: (body) => db.transaction((tx) => body(tx)),
      audit: (actor, _action, entry) => void logAuditEvent({ userId: actor.id, action: "BULK_ACTION", ...entry, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }),
    }, { ids: input.ids, operation: input.operation }).pipe(
      Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)),
      Effect.map((result) => ({ updated: result.updated, batchId: result.batchId })),
    );
  }),
});
