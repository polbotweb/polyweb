/**
 * Actions groupées du domaine formations sur le moteur générique `src/core/bulk` :
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
import { requireFormationsPermission, type FormationsPermission } from "../permissions";
import { formations, formationsRevisions } from "../schema";
import { formationsLock } from "../locks";
import { formationsWorkflow, type FormationsStatus } from "../domain/workflow";

type Row = typeof formations.$inferSelect;
type Db = ReturnType<typeof getDrizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Actor = { id: string };

export const FORMATIONS_BULK_OPERATIONS = ["publish", "unpublish", "archive", "restore"] as const;
export type FormationsBulkOperation = (typeof FORMATIONS_BULK_OPERATIONS)[number];

const TARGET: Record<FormationsBulkOperation, FormationsStatus> = { publish: "PUBLISHED", unpublish: "DRAFT", archive: "ARCHIVED", restore: "DRAFT" };
const PERMISSION: Record<FormationsBulkOperation, FormationsPermission> = { publish: "publish", unpublish: "publish", archive: "update", restore: "update" };

const transition = (op: FormationsBulkOperation): BulkOperationDefinition<Row, Tx, Actor> => ({
  validate: (row) => (canTransition(formationsWorkflow, row.status, TARGET[op]) ? null : "Transition de statut invalide : " + row.status + " → " + TARGET[op] + "."),
  apply: async (tx, row, actor) => {
    await tx.update(formations).set({ status: TARGET[op] }).where(eq(formations.id, row.id));
    await tx.insert(formationsRevisions).values({ resourceId: row.id, authorId: actor.id, title: row.title, slug: row.slug, status: TARGET[op], note: "Action groupée : " + op });
  },
  auditAction: "BULK_ACTION",
  auditMetadata: (row) => ({ operation: op, from: row.status, to: TARGET[op] }),
  confirmationKey: op === "archive" ? "formations.bulk.archive" : undefined,
});

export const formationsBulkOperations = Object.fromEntries(FORMATIONS_BULK_OPERATIONS.map((op) => [op, transition(op)])) as Record<FormationsBulkOperation, BulkOperationDefinition<Row, Tx, Actor>>;

export const bulkFormationsLifecycle = defineAction({
  input: z.object({ ids: z.array(z.uuid()).min(1).max(DEFAULT_BULK_MAX_ITEMS), organizationId: z.string().nullable().default(null), operation: z.enum(FORMATIONS_BULK_OPERATIONS) }),
  handler: effectHandler((input, context) => {
    const db = getDrizzle();
    const inTenant = input.organizationId === null ? isNull(formations.organizationId) : eq(formations.organizationId, input.organizationId);
    return runBulkAction({
      resource: "formations",
      operations: formationsBulkOperations,
      authorize: (op: FormationsBulkOperation) => requireFormationsPermission(context, [PERMISSION[op]], input.organizationId).pipe(Effect.map((user) => ({ id: user.id }))),
      load: (ids) => actionTry("formations.bulk.load", () => db.select().from(formations).where(and(inTenant, inArray(formations.id, [...ids])))),
      guard: (ids, actor) => formationsLock.ensureNoneLockedByOther(ids, lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
      transaction: (body) => db.transaction((tx) => body(tx)),
      audit: (actor, _action, entry) => void logAuditEvent({ userId: actor.id, action: "BULK_ACTION", ...entry, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }),
    }, { ids: input.ids, operation: input.operation }).pipe(
      Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)),
      Effect.map((result) => ({ updated: result.updated, batchId: result.batchId })),
    );
  }),
});
