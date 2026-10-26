/**
 * Actions groupées du domaine bookings sur le moteur générique `src/core/bulk` : sélection
 * validée, permission, périmètre tenant (hors périmètre → FORBIDDEN), verrous d'édition,
 * transition par ligne (tout ou rien), une transaction, révision + audit par ligne.
 * Seules les transitions qui libèrent ou clôturent un créneau sont proposées en masse
 * (la confirmation numérote et l'arrivée se pointe : actions unitaires).
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
import { requireBookingsPermission } from "../permissions";
import { bookings, bookingsRevisions } from "../schema";
import { bookingsLock } from "../locks";
import { bookingWorkflow, type BookingStatus } from "../domain/workflow";

type Row = typeof bookings.$inferSelect;
type Db = ReturnType<typeof getDrizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Actor = { id: string };

/** Annuler, marquer absent (no-show) ou terminer des réservations. */
export const BOOKINGS_BULK_OPERATIONS = ["cancel", "noShow", "complete"] as const;
export type BookingsBulkOperation = (typeof BOOKINGS_BULK_OPERATIONS)[number];

const TARGET: Record<BookingsBulkOperation, BookingStatus> = { cancel: "CANCELLED", noShow: "NO_SHOW", complete: "COMPLETED" };

const transition = (op: BookingsBulkOperation): BulkOperationDefinition<Row, Tx, Actor> => ({
  validate: (row) => (canTransition(bookingWorkflow, row.status, TARGET[op]) ? null : "Transition invalide : " + row.status + " → " + TARGET[op] + "."),
  apply: async (tx, row, actor) => {
    await tx.update(bookings).set({ status: TARGET[op] }).where(eq(bookings.id, row.id));
    await tx.insert(bookingsRevisions).values({ resourceId: row.id, authorId: actor.id, title: row.title, slug: row.slug, status: TARGET[op], note: "Action groupée : " + op });
  },
  auditAction: "BULK_ACTION",
  auditMetadata: (row) => ({ operation: op, from: row.status, to: TARGET[op] }),
  confirmationKey: op === "cancel" ? "bookings.bulk.cancel" : undefined,
});

export const bulkBookingsLifecycle = defineAction({
  input: z.object({
    ids: z.array(z.uuid()).min(1).max(DEFAULT_BULK_MAX_ITEMS),
    organizationId: z.string().nullable().default(null),
    operation: z.enum(BOOKINGS_BULK_OPERATIONS),
  }),
  handler: effectHandler((input, context) => {
    const db = getDrizzle();
    const inTenant = input.organizationId === null ? isNull(bookings.organizationId) : eq(bookings.organizationId, input.organizationId);
    const operations = Object.fromEntries(BOOKINGS_BULK_OPERATIONS.map((op) => [op, transition(op)])) as Record<BookingsBulkOperation, BulkOperationDefinition<Row, Tx, Actor>>;
    return runBulkAction({
      resource: "bookings",
      operations,
      authorize: () => requireBookingsPermission(context, ["update"], input.organizationId).pipe(Effect.map((user) => ({ id: user.id }))),
      load: (ids) => actionTry("bookings.bulk.load", () => db.select().from(bookings).where(and(inTenant, inArray(bookings.id, [...ids])))),
      guard: (ids, actor) => bookingsLock.ensureNoneLockedByOther(ids, lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
      transaction: (body) => db.transaction((tx) => body(tx)),
      audit: (actor, _action, entry) => void logAuditEvent({ userId: actor.id, action: "BULK_ACTION", ...entry, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }),
    }, { ids: input.ids, operation: input.operation }).pipe(
      Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)),
      Effect.map((result) => ({ updated: result.updated, batchId: result.batchId })),
    );
  }),
});
