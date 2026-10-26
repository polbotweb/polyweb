/**
 * Actions groupées du domaine sales sur le moteur générique `src/core/bulk` :
 * sélection validée (non vide, sans doublon, bornée), permission par opération,
 * périmètre tenant (hors périmètre → FORBIDDEN), verrous d'édition, transitions du
 * workflow par ligne (tout ou rien), une transaction, révision + audit par ligne
 * (batchId commun). Ids alignés sur `admin/resource.ts` (`list.bulkActions`).
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
import { requireSalesPermission, type SalesPermission } from "../permissions";
import { sales, salesDocumentRevisions } from "../schema";
import { salesLock } from "../locks";
import { workflowFor, type SalesStatus } from "../domain/workflow";

type Row = typeof sales.$inferSelect;
type Db = ReturnType<typeof getDrizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Actor = { id: string };

/**
 * Opérations groupées sans numérotation : annuler des brouillons / devis envoyés, expirer des
 * devis envoyés. L'émission (numéro légal, totaux figés) reste unitaire (`sales.transition`).
 */
export const SALES_BULK_OPERATIONS = ["cancel", "expire"] as const;
export type SalesBulkOperation = (typeof SALES_BULK_OPERATIONS)[number];

const TARGET: Record<SalesBulkOperation, SalesStatus> = { cancel: "CANCELLED", expire: "EXPIRED" };
const PERMISSION: Record<SalesBulkOperation, SalesPermission> = { cancel: "update", expire: "update" };

const transition = (op: SalesBulkOperation): BulkOperationDefinition<Row, Tx, Actor> => ({
  validate: (row) => (canTransition(workflowFor(row.kind), row.status, TARGET[op]) ? null : "Transition de statut invalide : " + row.status + " → " + TARGET[op] + "."),
  apply: async (tx, row, actor) => {
    await tx.update(sales).set({ status: TARGET[op] }).where(eq(sales.id, row.id));
    await tx.insert(salesDocumentRevisions).values({ resourceId: row.id, authorId: actor.id, title: row.title, slug: row.slug, status: TARGET[op], number: row.number, grossMinor: row.grossMinor, note: "Action groupée : " + op });
  },
  auditAction: "BULK_ACTION",
  auditMetadata: (row) => ({ operation: op, from: row.status, to: TARGET[op] }),
  confirmationKey: op === "cancel" ? "sales.bulk.cancel" : undefined,
});

export const salesBulkOperations = Object.fromEntries(SALES_BULK_OPERATIONS.map((op) => [op, transition(op)])) as Record<SalesBulkOperation, BulkOperationDefinition<Row, Tx, Actor>>;

export const bulkSalesLifecycle = defineAction({
  input: z.object({ ids: z.array(z.uuid()).min(1).max(DEFAULT_BULK_MAX_ITEMS), organizationId: z.string().nullable().default(null), operation: z.enum(SALES_BULK_OPERATIONS) }),
  handler: effectHandler((input, context) => {
    const db = getDrizzle();
    const inTenant = input.organizationId === null ? isNull(sales.organizationId) : eq(sales.organizationId, input.organizationId);
    return runBulkAction({
      resource: "sales",
      operations: salesBulkOperations,
      authorize: (op: SalesBulkOperation) => requireSalesPermission(context, [PERMISSION[op]], input.organizationId).pipe(Effect.map((user) => ({ id: user.id }))),
      load: (ids) => actionTry("sales.bulk.load", () => db.select().from(sales).where(and(inTenant, inArray(sales.id, [...ids])))),
      guard: (ids, actor) => salesLock.ensureNoneLockedByOther(ids, lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
      transaction: (body) => db.transaction((tx) => body(tx)),
      audit: (actor, _action, entry) => void logAuditEvent({ userId: actor.id, action: "BULK_ACTION", ...entry, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }),
    }, { ids: input.ids, operation: input.operation }).pipe(
      Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)),
      Effect.map((result) => ({ updated: result.updated, batchId: result.batchId })),
    );
  }),
});
