/**
 * Service Effect du domaine bookings : ressources (code unique par tenant, plages d'ouverture
 * core/scheduling) et réservations. Toute écriture qui occupe un créneau verrouille la ligne de la
 * ressource (`FOR UPDATE`) puis contrôle plages d'ouverture et chevauchement avec les
 * réservations actives : deux réservations concurrentes sur la même ressource sont sérialisées.
 * Numéro core/numbering à la confirmation. Erreurs de domaine → BAD_REQUEST, conflit → CONFLICT,
 * référence d'un autre tenant → NOT_FOUND (sans fuite).
 */
import { Effect } from "effect";
import { and, asc, eq, gt, inArray, isNull, lt, ne, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { canTransition } from "@/core/workflow";
import { assignDocumentNumber } from "@/core/numbering";
import type { LockOwner } from "@/core/locks/policy";
import { freeSlots, localDate, zonedToUtc, type Interval, type WeeklyWindow } from "@/core/scheduling";
import { bookings, bookingsResources, bookingsRevisions } from "../schema";
import { bookingsLock } from "../locks";
import { ACTIVE_STATUSES, assignsNumber, bookingWorkflow, isEditable, reoccupiesSlot, type BookingStatus } from "../domain/workflow";
import { validateResource } from "../domain/resource";
import { checkSlot, validateBooking } from "../domain/booking";
import { BOOKING_NUMBERING_KEY, DEFAULT_BOOKING_NUMBERING } from "../domain/numbering";
import type { BookingConflictError, InvalidBookingError, InvalidResourceError, OutsideAvailabilityError } from "../domain/errors";
import { isBookableDate, validateGuest, type GuestInput, type InvalidGuestError } from "../domain/guest";

export type BookingRow = typeof bookings.$inferSelect;
export type ResourceRow = typeof bookingsResources.$inferSelect;
type Executor = ReturnType<typeof getDrizzle> | DbTransaction;

type DomainError = InvalidResourceError | InvalidBookingError | OutsideAvailabilityError | BookingConflictError;
const domain = <A>(effect: Effect.Effect<A, DomainError>) =>
  Effect.catch(effect, (error: DomainError) => fail(error._tag === "BookingConflictError" ? "CONFLICT" : "BAD_REQUEST", error.message));

const sameTenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));

const slugify = (title: string) =>
  title.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "reservation";

const findBooking = (executor: Executor, id: string, forUpdate = false) =>
  dbTry("bookings.findById", () => {
    const query = executor.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    return forUpdate ? query.for("update") : query;
  }).pipe(Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", "Réservation introuvable."))));

/** Ressource du tenant, verrouillée pour sérialiser les écritures de créneaux. */
const lockResource = (tx: DbTransaction, resourceId: string, organizationId: string | null) =>
  dbTry("bookings.resource.lock", () =>
    tx.select().from(bookingsResources).where(and(eq(bookingsResources.id, resourceId), sameTenant(bookingsResources.organizationId, organizationId))).limit(1).for("update"),
  ).pipe(Effect.flatMap((rows) => (rows[0] ? Effect.succeed(rows[0]) : fail("NOT_FOUND", "Ressource introuvable."))));

/** Réservations actives de la ressource qui intersectent `interval` (hors `exceptId`). */
const activeOverlapping = (executor: Executor, resourceId: string, interval: Interval, exceptId?: string) =>
  dbTry("bookings.active", () =>
    executor.select({ id: bookings.id, start: bookings.startsAt, end: bookings.endsAt }).from(bookings).where(and(
      eq(bookings.resourceId, resourceId), inArray(bookings.status, [...ACTIVE_STATUSES]),
      lt(bookings.startsAt, interval.end), gt(bookings.endsAt, interval.start), exceptId ? ne(bookings.id, exceptId) : undefined,
    )));

/** Contrôle complet du créneau sous verrou de ressource. */
const assertSlot = (tx: DbTransaction, resource: ResourceRow, interval: Interval, exceptId?: string) =>
  Effect.gen(function* () {
    if (!resource.active) return yield* fail("BAD_REQUEST", "Ressource inactive.");
    const active = yield* activeOverlapping(tx, resource.id, interval, exceptId);
    return yield* domain(checkSlot(interval, { resourceId: resource.id, timezone: resource.timezone, windows: resource.windows, active }));
  });

const revision = (executor: Executor, row: BookingRow, authorId: string, note: string) =>
  dbTry("bookings.revision", () => executor.insert(bookingsRevisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, note }));

export interface ResourceInput {
  readonly code: string;
  readonly name: string;
  readonly kind?: string;
  readonly capacity?: number;
  readonly timezone?: string;
  readonly slotMinutes?: number;
  readonly windows?: readonly WeeklyWindow[];
  readonly active?: boolean;
}

const resourceColumns = (executor: Executor, input: ResourceInput, organizationId: string | null, exceptId?: string) =>
  Effect.gen(function* () {
    const valid = yield* domain(validateResource({
      code: input.code, name: input.name, kind: input.kind ?? "room", capacity: input.capacity ?? 1,
      timezone: input.timezone ?? "UTC", slotMinutes: input.slotMinutes ?? 30, windows: input.windows ?? [],
    }));
    const clash = yield* dbTry("bookings.resource.dedup", () =>
      executor.select({ id: bookingsResources.id }).from(bookingsResources)
        .where(and(eq(bookingsResources.code, valid.code), sameTenant(bookingsResources.organizationId, organizationId), exceptId ? ne(bookingsResources.id, exceptId) : undefined)).limit(1));
    if (clash[0]) return yield* fail("CONFLICT", `Le code ressource ${valid.code} existe déjà.`);
    return { ...valid, windows: [...valid.windows], active: input.active ?? true };
  });

/** Créneau : instants UTC (ISO) ou date + heure locales de la ressource + durée. */
export type SlotInput =
  | { readonly startsAt: string; readonly endsAt: string }
  | { readonly date: string; readonly time: string; readonly durationMinutes: number };

export interface BookingInput {
  readonly resourceId: string;
  readonly slot: SlotInput;
  readonly customerName: string;
  readonly customerEmail?: string | null;
  readonly partySize?: number;
  readonly notes?: string | null;
}

const slotInstants = (slot: SlotInput, timezone: string) => {
  if ("startsAt" in slot) return { startsAt: slot.startsAt, endsAt: slot.endsAt };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time) || !Number.isSafeInteger(slot.durationMinutes)) {
    return { startsAt: "invalid", endsAt: "invalid" };
  }
  const start = zonedToUtc(slot.date, slot.time, timezone);
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + slot.durationMinutes * 60_000).toISOString() };
};

const bookingColumns = (tx: DbTransaction, input: BookingInput, organizationId: string | null, exceptId?: string) =>
  Effect.gen(function* () {
    const resource = yield* lockResource(tx, input.resourceId, organizationId);
    const valid = yield* domain(validateBooking({
      ...slotInstants(input.slot, resource.timezone), customerName: input.customerName, customerEmail: input.customerEmail ?? null, partySize: input.partySize ?? 1,
    }, resource.capacity));
    yield* assertSlot(tx, resource, { start: valid.startsAt, end: valid.endsAt }, exceptId);
    return {
      resourceId: resource.id, startsAt: valid.startsAt, endsAt: valid.endsAt, customerName: valid.customerName, customerEmail: valid.customerEmail,
      partySize: valid.partySize, notes: input.notes?.trim() || null, title: `${valid.customerName} — ${resource.name}`.slice(0, 200),
    };
  });

/** Demande de réservation d'un visiteur : un créneau libre (instant de début) d'une ressource publique. */
export interface GuestBookingInput extends GuestInput {
  readonly organizationId: string | null;
  readonly resourceId: string;
  /** Instant ISO du début d'un créneau proposé par `freeSlots`. */
  readonly startsAt: string;
}

/** Erreur du parcours public : champs invalides (affichés par champ) ou créneau plus disponible. */
export type GuestBookingError = InvalidGuestError | { readonly _tag: "SlotUnavailable" };
const slotUnavailable = { _tag: "SlotUnavailable" } as const;

export const bookingsService = {
  // ── Ressources ──────────────────────────────────────────────────────────
  createResource: (input: ResourceInput & { readonly organizationId: string | null }) =>
    dbTransaction("bookings.resource.create", (tx) =>
      Effect.gen(function* () {
        const columns = yield* resourceColumns(tx, input, input.organizationId);
        const [row] = yield* dbTry("bookings.resource.create", () => tx.insert(bookingsResources).values({ ...columns, organizationId: input.organizationId }).returning());
        return row!;
      })),

  /** Les réservations existantes restent valides même si les plages changent. */
  updateResource: (id: string, input: ResourceInput) =>
    dbTransaction("bookings.resource.update", (tx) =>
      Effect.gen(function* () {
        const [current] = yield* dbTry("bookings.resource.find", () => tx.select().from(bookingsResources).where(eq(bookingsResources.id, id)).limit(1).for("update"));
        if (!current) return yield* fail("NOT_FOUND", "Ressource introuvable.");
        const columns = yield* resourceColumns(tx, input, current.organizationId, id);
        const [over] = yield* dbTry("bookings.resource.capacity", () =>
          tx.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.resourceId, id), inArray(bookings.status, [...ACTIVE_STATUSES]), gt(bookings.partySize, columns.capacity))).limit(1));
        if (over) return yield* fail("CONFLICT", "Capacité inférieure à l'effectif d'une réservation active.");
        const [row] = yield* dbTry("bookings.resource.update", () => tx.update(bookingsResources).set(columns).where(eq(bookingsResources.id, id)).returning());
        return row!;
      })),

  /** Suppression refusée si la ressource a des réservations (la désactiver à la place). */
  deleteResource: (id: string) =>
    dbTransaction("bookings.resource.delete", (tx) =>
      Effect.gen(function* () {
        const used = yield* dbTry("bookings.resource.used", () => tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.resourceId, id)).limit(1));
        if (used[0]) return yield* fail("CONFLICT", "Ressource utilisée : désactivez-la plutôt que de la supprimer.");
        const rows = yield* dbTry("bookings.resource.delete", () => tx.delete(bookingsResources).where(eq(bookingsResources.id, id)).returning({ id: bookingsResources.id }));
        return rows[0] ? { id } : yield* fail("NOT_FOUND", "Ressource introuvable.");
      })),

  // ── Réservations ────────────────────────────────────────────────────────
  createBooking: (input: BookingInput & { readonly organizationId: string | null }, authorId: string) =>
    dbTransaction("bookings.create", (tx) =>
      Effect.gen(function* () {
        const columns = yield* bookingColumns(tx, input, input.organizationId);
        const slug = `${slugify(columns.customerName)}-${crypto.randomUUID().slice(0, 8)}`;
        const [row] = yield* dbTry("bookings.create", () => tx.insert(bookings).values({ ...columns, slug, organizationId: input.organizationId, createdBy: authorId }).returning());
        yield* revision(tx, row!, authorId, "Création");
        return row!;
      })),

  /**
   * Parcours public. Sous verrou de la ressource, le créneau demandé doit être EXACTEMENT un des
   * créneaux libres recalculés côté serveur (plages d'ouverture − réservations actives, futur,
   * horizon) : alignement, ouverture et non-chevauchement sont revérifiés dans la transaction.
   * Statut « demandée », sans auteur (pas de révision : l'historique est porté par l'audit).
   */
  createGuestBooking: (input: GuestBookingInput, now: Date = new Date()) =>
    dbTransaction("bookings.guest.create", (tx) =>
      Effect.gen(function* () {
        const resource = yield* lockResource(tx, input.resourceId, input.organizationId);
        if (!resource.active) return yield* Effect.fail(slotUnavailable);
        const guest = yield* validateGuest(input, resource.capacity);
        const start = new Date(input.startsAt);
        if (Number.isNaN(start.getTime())) return yield* Effect.fail(slotUnavailable);
        const date = localDate(start, resource.timezone);
        if (!isBookableDate(date, localDate(now, resource.timezone))) return yield* Effect.fail(slotUnavailable);
        const end = new Date(start.getTime() + resource.slotMinutes * 60_000);
        const dayStart = zonedToUtc(date, "00:00", resource.timezone);
        const busy = yield* activeOverlapping(tx, resource.id, { start: new Date(dayStart.getTime() - 86_400_000), end: new Date(dayStart.getTime() + 2 * 86_400_000) });
        const offered = freeSlots(date, resource.windows, resource.timezone, busy, resource.slotMinutes, now);
        if (!offered.some((slot) => slot.start.getTime() === start.getTime())) return yield* Effect.fail(slotUnavailable);
        yield* checkSlot({ start, end }, { resourceId: resource.id, timezone: resource.timezone, windows: resource.windows, active: busy }).pipe(Effect.mapError(() => slotUnavailable));
        const slug = `${slugify(guest.customerName)}-${crypto.randomUUID().slice(0, 8)}`;
        const [row] = yield* dbTry("bookings.guest.create", () => tx.insert(bookings).values({
          organizationId: input.organizationId, resourceId: resource.id, startsAt: start, endsAt: end, slug,
          title: `${guest.customerName} — ${resource.name}`.slice(0, 200), customerName: guest.customerName, customerEmail: guest.customerEmail,
          customerPhone: guest.customerPhone, partySize: guest.partySize, notes: guest.notes,
        }).returning());
        return { booking: row!, resource };
      })),

  /**
   * Annulation par le visiteur (lien signé vérifié par l'appelant) : demandée ou confirmée, créneau
   * non commencé. Idempotent : une réservation déjà annulée est renvoyée telle quelle.
   */
  cancelByGuest: (id: string, now: Date = new Date()) =>
    dbTransaction("bookings.guest.cancel", (tx) =>
      Effect.gen(function* () {
        const current = yield* findBooking(tx, id, true);
        if (current.status === "CANCELLED") return current;
        if (!canTransition(bookingWorkflow, current.status, "CANCELLED") || current.startsAt.getTime() <= now.getTime()) {
          return yield* fail("BAD_REQUEST", "Réservation non annulable.");
        }
        const [row] = yield* dbTry("bookings.guest.cancel", () => tx.update(bookings).set({ status: "CANCELLED" }).where(eq(bookings.id, id)).returning());
        return row!;
      })),

  /** Modification (créneau, client, effectif) : demandée ou confirmée uniquement. */
  updateBooking: (id: string, input: BookingInput, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* bookingsLock.ensureNotLockedByOther(id, owner, locale);
      return yield* dbTransaction("bookings.update", (tx) =>
        Effect.gen(function* () {
          const current = yield* findBooking(tx, id, true);
          if (!isEditable(current.status)) return yield* fail("BAD_REQUEST", "Réservation non modifiable dans ce statut.");
          const columns = yield* bookingColumns(tx, input, current.organizationId, id);
          const [row] = yield* dbTry("bookings.update", () => tx.update(bookings).set(columns).where(eq(bookings.id, id)).returning());
          yield* revision(tx, row!, owner.userId, "Mise à jour");
          return row!;
        }));
    }),

  /** Transition du cycle de vie ; numéro attribué à la première confirmation. */
  transition: (id: string, to: BookingStatus, owner: LockOwner, options: { readonly locale?: string; readonly today?: string } = {}) =>
    Effect.gen(function* () {
      yield* bookingsLock.ensureNotLockedByOther(id, owner, options.locale);
      return yield* dbTransaction("bookings.transition", (tx) =>
        Effect.gen(function* () {
          const current = yield* findBooking(tx, id, true);
          if (!canTransition(bookingWorkflow, current.status, to)) return yield* fail("BAD_REQUEST", `Transition invalide : ${current.status} → ${to}.`);
          if (reoccupiesSlot(current.status, to)) {
            const resource = yield* lockResource(tx, current.resourceId, current.organizationId);
            yield* assertSlot(tx, resource, { start: current.startsAt, end: current.endsAt }, id);
          }
          const patch: Partial<typeof bookings.$inferInsert> = { status: to };
          if (assignsNumber(current.status, to)) {
            if (!current.number) {
              patch.number = yield* assignDocumentNumber(tx, {
                organizationId: current.organizationId, key: BOOKING_NUMBERING_KEY, scheme: DEFAULT_BOOKING_NUMBERING, date: options.today ?? new Date().toISOString().slice(0, 10),
              }).pipe(Effect.map(({ number }) => number), Effect.catch((error) => fail("BAD_REQUEST", error.message)));
            }
            patch.confirmedAt = new Date();
          }
          const [row] = yield* dbTry("bookings.transition", () => tx.update(bookings).set(patch).where(eq(bookings.id, id)).returning());
          yield* revision(tx, row!, owner.userId, `Statut ${current.status} → ${to}`);
          return row!;
        }));
    }),

  /** Suppression : demandée ou annulée uniquement (l'historique des autres est conservé). */
  deleteBooking: (id: string, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* bookingsLock.ensureNotLockedByOther(id, owner, locale);
      return yield* dbTransaction("bookings.delete", (tx) =>
        Effect.gen(function* () {
          const current = yield* findBooking(tx, id, true);
          if (current.status !== "REQUESTED" && current.status !== "CANCELLED") return yield* fail("BAD_REQUEST", "Seule une réservation demandée ou annulée peut être supprimée.");
          yield* dbTry("bookings.delete", () => tx.delete(bookings).where(eq(bookings.id, id)));
          return { id };
        }));
    }),

  findByIds: (ids: readonly string[]) =>
    ids.length === 0 ? Effect.succeed([] as BookingRow[]) : dbTry("bookings.findByIds", () => getDrizzle().select().from(bookings).where(inArray(bookings.id, [...ids])).orderBy(asc(bookings.startsAt))),

  lock: (id: string, owner: LockOwner, options: { takeOver?: boolean; locale?: string } = {}) => bookingsLock.acquire(id, owner, options),
  unlock: (id: string, owner: LockOwner) => bookingsLock.release(id, owner),
};
