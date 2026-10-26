/**
 * Actions groupées du domaine crm sur le moteur générique `src/core/bulk` : sélection validée,
 * permission par opération, périmètre tenant (hors périmètre → FORBIDDEN), verrous d'édition,
 * transitions du pipeline par ligne (tout ou rien), une transaction, révision + audit par ligne.
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
import { requireCrmPermission } from "../permissions";
import { crm, crmOpportunityRevisions } from "../schema";
import { crmLock } from "../locks";
import { crmWorkflow, LOST_REASONS, type CrmStage } from "../domain/workflow";

type Row = typeof crm.$inferSelect;
type Db = ReturnType<typeof getDrizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Actor = { id: string };

/** Qualifier des pistes, ou classer perdues (raison commune « no_decision » par défaut). */
export const CRM_BULK_OPERATIONS = ["qualify", "lose"] as const;
export type CrmBulkOperation = (typeof CRM_BULK_OPERATIONS)[number];

const TARGET: Record<CrmBulkOperation, CrmStage> = { qualify: "QUALIFIED", lose: "LOST" };

const transition = (op: CrmBulkOperation, lostReason: (typeof LOST_REASONS)[number]): BulkOperationDefinition<Row, Tx, Actor> => ({
  validate: (row) => (canTransition(crmWorkflow, row.status, TARGET[op]) ? null : "Transition d'étape invalide : " + row.status + " → " + TARGET[op] + "."),
  apply: async (tx, row, actor) => {
    const lost = op === "lose";
    await tx.update(crm).set({ status: TARGET[op], lostReason: lost ? lostReason : null, closedAt: lost ? new Date() : null }).where(eq(crm.id, row.id));
    await tx.insert(crmOpportunityRevisions).values({ resourceId: row.id, authorId: actor.id, title: row.title, slug: row.slug, status: TARGET[op], amountMinor: row.amountMinor, note: "Action groupée : " + op });
  },
  auditAction: "BULK_ACTION",
  auditMetadata: (row) => ({ operation: op, from: row.status, to: TARGET[op] }),
  confirmationKey: op === "lose" ? "crm.bulk.lose" : undefined,
});

export const bulkCrmLifecycle = defineAction({
  input: z.object({
    ids: z.array(z.uuid()).min(1).max(DEFAULT_BULK_MAX_ITEMS),
    organizationId: z.string().nullable().default(null),
    operation: z.enum(CRM_BULK_OPERATIONS),
    lostReason: z.enum(LOST_REASONS).default("no_decision"),
  }),
  handler: effectHandler((input, context) => {
    const db = getDrizzle();
    const inTenant = input.organizationId === null ? isNull(crm.organizationId) : eq(crm.organizationId, input.organizationId);
    const operations = Object.fromEntries(CRM_BULK_OPERATIONS.map((op) => [op, transition(op, input.lostReason)])) as Record<CrmBulkOperation, BulkOperationDefinition<Row, Tx, Actor>>;
    return runBulkAction({
      resource: "crm",
      operations,
      authorize: () => requireCrmPermission(context, ["update"], input.organizationId).pipe(Effect.map((user) => ({ id: user.id }))),
      load: (ids) => actionTry("crm.bulk.load", () => db.select().from(crm).where(and(inTenant, inArray(crm.id, [...ids])))),
      guard: (ids, actor) => crmLock.ensureNoneLockedByOther(ids, lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
      transaction: (body) => db.transaction((tx) => body(tx)),
      audit: (actor, _action, entry) => void logAuditEvent({ userId: actor.id, action: "BULK_ACTION", ...entry, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }),
    }, { ids: input.ids, operation: input.operation }).pipe(
      Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)),
      Effect.map((result) => ({ updated: result.updated, batchId: result.batchId })),
    );
  }),
});
