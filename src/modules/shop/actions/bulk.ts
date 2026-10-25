/**
 * Actions groupées du domaine shop sur le moteur générique `src/core/bulk` :
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
import { requireShopPermission, type ShopPermission } from "../permissions";
import { shop, shopRevisions } from "../schema";
import { shopLock } from "../locks";
import { shopWorkflow, type ShopStatus } from "../domain/workflow";

type Row = typeof shop.$inferSelect;
type Db = ReturnType<typeof getDrizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Actor = { id: string };

export const SHOP_BULK_OPERATIONS = ["publish", "unpublish", "archive", "restore"] as const;
export type ShopBulkOperation = (typeof SHOP_BULK_OPERATIONS)[number];

const TARGET: Record<ShopBulkOperation, ShopStatus> = { publish: "PUBLISHED", unpublish: "DRAFT", archive: "ARCHIVED", restore: "DRAFT" };
const PERMISSION: Record<ShopBulkOperation, ShopPermission> = { publish: "publish", unpublish: "publish", archive: "update", restore: "update" };

const transition = (op: ShopBulkOperation): BulkOperationDefinition<Row, Tx, Actor> => ({
  validate: (row) => (canTransition(shopWorkflow, row.status, TARGET[op]) ? null : "Transition de statut invalide : " + row.status + " → " + TARGET[op] + "."),
  apply: async (tx, row, actor) => {
    await tx.update(shop).set({ status: TARGET[op] }).where(eq(shop.id, row.id));
    await tx.insert(shopRevisions).values({ resourceId: row.id, authorId: actor.id, title: row.title, slug: row.slug, status: TARGET[op], note: "Action groupée : " + op });
  },
  auditAction: "BULK_ACTION",
  auditMetadata: (row) => ({ operation: op, from: row.status, to: TARGET[op] }),
  confirmationKey: op === "archive" ? "shop.bulk.archive" : undefined,
});

export const shopBulkOperations = Object.fromEntries(SHOP_BULK_OPERATIONS.map((op) => [op, transition(op)])) as Record<ShopBulkOperation, BulkOperationDefinition<Row, Tx, Actor>>;

export const bulkShopLifecycle = defineAction({
  input: z.object({ ids: z.array(z.uuid()).min(1).max(DEFAULT_BULK_MAX_ITEMS), organizationId: z.string().nullable().default(null), operation: z.enum(SHOP_BULK_OPERATIONS) }),
  handler: effectHandler((input, context) => {
    const db = getDrizzle();
    const inTenant = input.organizationId === null ? isNull(shop.organizationId) : eq(shop.organizationId, input.organizationId);
    return runBulkAction({
      resource: "shop",
      operations: shopBulkOperations,
      authorize: (op: ShopBulkOperation) => requireShopPermission(context, [PERMISSION[op]]).pipe(Effect.map((user) => ({ id: user.id }))),
      load: (ids) => actionTry("shop.bulk.load", () => db.select().from(shop).where(and(inTenant, inArray(shop.id, [...ids])))),
      guard: (ids, actor) => shopLock.ensureNoneLockedByOther(ids, lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
      transaction: (body) => db.transaction((tx) => body(tx)),
      audit: (actor, _action, entry) => void logAuditEvent({ userId: actor.id, action: "BULK_ACTION", ...entry, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }),
    }, { ids: input.ids, operation: input.operation }).pipe(
      Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)),
      Effect.map((result) => ({ updated: result.updated, batchId: result.batchId })),
    );
  }),
});
