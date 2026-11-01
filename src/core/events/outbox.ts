/**
 * Outbox transactionnelle des événements métier.
 *
 * `recordEvent(tx, name, payload, { organizationId })` écrit l'événement dans `event_outbox`
 * DANS la transaction du changement d'état : il n'existe que si celle-ci est validée.
 * Après COMMIT, `dispatchOutboxEvent` le diffuse sur le bus (webhooks, plugins) ; la ligne
 * n'est marquée diffusée que si tous les abonnés ont réussi, sinon le cron
 * (`processOutbox`) la rediffuse. La mise en file des webhooks est idempotente (unicité
 * webhook + événement) : une rediffusion ne crée pas de seconde livraison.
 */
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { eventOutbox } from "@database/schemas/event-outbox.schema";
import { dbTry } from "@/lib/effect/run";
import type { DbError } from "@/lib/effect/errors";
import { afterCommit, type DbTransaction } from "@/lib/effect/transaction";
import { publishEventEffect, type PolywebEvent, type PolywebEventName } from "./index";

const LOCK_MS = 60_000;
/** Délai avant reprise par le cron : laisse la diffusion post-commit se faire d'abord. */
const GRACE_MS = 30_000;

export type OutboxDispatch = "dispatched" | "skipped" | "failed";

/** Diffuse une ligne de l'outbox (verrou court ; sans effet si déjà diffusée ou prise). */
export const dispatchOutboxEvent = (id: string): Effect.Effect<OutboxDispatch> =>
  Effect.gen(function* () {
    const db = getDrizzle();
    const now = new Date();
    const [row] = yield* dbTry("events.outbox.claim", () =>
      db
        .update(eventOutbox)
        .set({ lockedUntil: new Date(now.getTime() + LOCK_MS), attempts: sql`${eventOutbox.attempts} + 1` })
        .where(and(eq(eventOutbox.id, id), isNull(eventOutbox.dispatchedAt), or(isNull(eventOutbox.lockedUntil), lte(eventOutbox.lockedUntil, now))))
        .returning(),
    );
    if (!row) return "skipped" as const;
    const event: PolywebEvent = { id: row.id, name: row.name as PolywebEventName, occurredAt: row.occurredAt.toISOString(), siteId: null, organizationId: row.organizationId, payload: row.payload };
    const failures = yield* publishEventEffect(event);
    yield* dbTry("events.outbox.settle", () =>
      db
        .update(eventOutbox)
        .set(failures === 0 ? { dispatchedAt: new Date(), lockedUntil: null, lastError: null } : { lockedUntil: null, lastError: `${failures} abonné(s) en échec` })
        .where(eq(eventOutbox.id, row.id)),
    );
    return failures === 0 ? ("dispatched" as const) : ("failed" as const);
  }).pipe(
    Effect.catchCause((cause) => Effect.logError("[events] outbox dispatch failed", cause).pipe(Effect.as("failed" as const))),
    Effect.withSpan("events.outbox.dispatch", { attributes: { "event.id": id } }),
  );

/**
 * Enregistre un événement dans la transaction courante ; diffusion programmée après COMMIT.
 * À utiliser pour tout événement métier émis par un changement d'état transactionnel.
 */
export const recordEvent = (
  tx: DbTransaction,
  name: PolywebEventName,
  payload: Record<string, unknown>,
  options: { readonly organizationId: string | null },
): Effect.Effect<string, DbError> =>
  Effect.gen(function* () {
    const [row] = yield* dbTry("events.outbox.record", () =>
      tx.insert(eventOutbox).values({ name, organizationId: options.organizationId, payload }).returning({ id: eventOutbox.id }),
    );
    yield* afterCommit(tx, dispatchOutboxEvent(row.id));
    return row.id;
  });

/** Reprise (cron) des événements validés mais non diffusés : crash, abonné en échec. */
export const processOutbox = (limit = 100) =>
  Effect.gen(function* () {
    const now = new Date();
    const due = yield* dbTry("events.outbox.due", () =>
      getDrizzle()
        .select({ id: eventOutbox.id })
        .from(eventOutbox)
        .where(and(isNull(eventOutbox.dispatchedAt), lte(eventOutbox.occurredAt, new Date(now.getTime() - GRACE_MS)), or(isNull(eventOutbox.lockedUntil), lte(eventOutbox.lockedUntil, now))))
        .orderBy(asc(eventOutbox.occurredAt))
        .limit(limit),
    );
    const outcomes = yield* Effect.forEach(due, (d) => dispatchOutboxEvent(d.id), { concurrency: 4 });
    return { outboxProcessed: outcomes.length, outboxFailed: outcomes.filter((o) => o === "failed").length };
  });
