/**
 * Actions groupées du domaine purchasing sur le moteur générique `src/core/bulk` : sélection
 * validée, permission, périmètre tenant (hors périmètre → FORBIDDEN), verrous d'édition,
 * transition par ligne (tout ou rien), une transaction, révision + audit par ligne.
 * Seules les transitions SANS effet de stock ni numérotation sont proposées en masse
 * (l'envoi numérote, la réception écrit le stock : action unitaire).
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
import { requirePurchasingPermission } from "../permissions";
import { purchasing, purchasingOrderRevisions } from "../schema";
import { purchasingLock } from "../locks";
import { purchaseOrderWorkflow, type PurchaseOrderStatus } from "../domain/workflow";

type Row = typeof purchasing.$inferSelect;
type Db = ReturnType<typeof getDrizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Actor = { id: string };

/** Annuler des brouillons / envoyées, ou solder des commandes (partiellement) reçues. */
export const PURCHASING_BULK_OPERATIONS = ["cancel", "close"] as const;
export type PurchasingBulkOperation = (typeof PURCHASING_BULK_OPERATIONS)[number];

const TARGET: Record<PurchasingBulkOperation, PurchaseOrderStatus> = { cancel: "CANCELLED", close: "CLOSED" };

const transition = (op: PurchasingBulkOperation): BulkOperationDefinition<Row, Tx, Actor> => ({
  validate: (row) => (canTransition(purchaseOrderWorkflow, row.status, TARGET[op]) ? null : "Transition invalide : " + row.status + " → " + TARGET[op] + "."),
  apply: async (tx, row, actor) => {
    await tx.update(purchasing).set({ status: TARGET[op] }).where(eq(purchasing.id, row.id));
    await tx.insert(purchasingOrderRevisions).values({ resourceId: row.id, authorId: actor.id, title: row.title, slug: row.slug, status: TARGET[op], note: "Action groupée : " + op });
  },
  auditAction: "BULK_ACTION",
  auditMetadata: (row) => ({ operation: op, from: row.status, to: TARGET[op] }),
  confirmationKey: op === "cancel" ? "purchasing.bulk.cancel" : undefined,
});

export const bulkPurchasingLifecycle = defineAction({
  input: z.object({
    ids: z.array(z.uuid()).min(1).max(DEFAULT_BULK_MAX_ITEMS),
    organizationId: z.string().nullable().default(null),
    operation: z.enum(PURCHASING_BULK_OPERATIONS),
  }),
  handler: effectHandler((input, context) => {
    const db = getDrizzle();
    const inTenant = input.organizationId === null ? isNull(purchasing.organizationId) : eq(purchasing.organizationId, input.organizationId);
    const operations = Object.fromEntries(PURCHASING_BULK_OPERATIONS.map((op) => [op, transition(op)])) as Record<PurchasingBulkOperation, BulkOperationDefinition<Row, Tx, Actor>>;
    return runBulkAction({
      resource: "purchasing",
      operations,
      authorize: () => requirePurchasingPermission(context, ["update"], input.organizationId).pipe(Effect.map((user) => ({ id: user.id }))),
      load: (ids) => actionTry("purchasing.bulk.load", () => db.select().from(purchasing).where(and(inTenant, inArray(purchasing.id, [...ids])))),
      guard: (ids, actor) => purchasingLock.ensureNoneLockedByOther(ids, lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
      transaction: (body) => db.transaction((tx) => body(tx)),
      audit: (actor, _action, entry) => void logAuditEvent({ userId: actor.id, action: "BULK_ACTION", ...entry, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }),
    }, { ids: input.ids, operation: input.operation }).pipe(
      Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)),
      Effect.map((result) => ({ updated: result.updated, batchId: result.batchId })),
    );
  }),
});
