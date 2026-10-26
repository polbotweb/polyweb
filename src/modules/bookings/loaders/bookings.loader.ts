/**
 * Lecture du domaine bookings (back-office uniquement). SEUL endroit autorisé à LIRE la base
 * pour ce domaine (les écritures passent par `services/`). Chaque lecture est un Effect
 * (`dbTry` → DbError typé), bornée au tenant ; adaptateurs Promise pour les pages Astro.
 */
import { Effect } from "effect";
import { and, asc, eq, gt, inArray, isNull, lt, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { freeSlots, zonedToUtc, type Interval } from "@/core/scheduling";
import { bookings, bookingsResources } from "../schema";
import { ACTIVE_STATUSES } from "../domain/workflow";

type Booking = typeof bookings.$inferSelect;
type Resource = typeof bookingsResources.$inferSelect;
export type BookingDetail = Booking & { readonly resource: Resource | null };
export type DayAvailability = { readonly resource: Resource; readonly slots: readonly Interval[]; readonly busy: readonly (Interval & { readonly id: string })[] };

const tenant = (column: PgColumn, organizationId: string | null): SQL => (organizationId === null ? isNull(column) : eq(column, organizationId));
const first = <T>(rows: readonly T[]): T | null => rows[0] ?? null;
const DAY = 86_400_000;

export const bookingsLoader = {
  booking: (id: string, organizationId: string | null) =>
    Effect.gen(function* () {
      const db = getDrizzle();
      const row = first(yield* dbTry("bookings.booking", () => db.select().from(bookings).where(and(eq(bookings.id, id), tenant(bookings.organizationId, organizationId))).limit(1)));
      if (!row) return null;
      const resource = first(yield* dbTry("bookings.booking.resource", () => db.select().from(bookingsResources).where(eq(bookingsResources.id, row.resourceId)).limit(1)));
      return { ...row, resource } satisfies BookingDetail;
    }),

  resource: (id: string, organizationId: string | null) =>
    dbTry("bookings.resource", () => getDrizzle().select().from(bookingsResources).where(and(eq(bookingsResources.id, id), tenant(bookingsResources.organizationId, organizationId))).limit(1)).pipe(Effect.map(first)),

  resources: (organizationId: string | null, options: { readonly activeOnly?: boolean } = {}) =>
    dbTry("bookings.resources", () => getDrizzle().select().from(bookingsResources)
      .where(and(tenant(bookingsResources.organizationId, organizationId), options.activeOnly ? eq(bookingsResources.active, true) : undefined)).orderBy(asc(bookingsResources.code))),

  /** Organisation d'une ressource (après garde de permission) ; `null` = plateforme ou introuvable. */
  resourceOrganization: (id: string) =>
    dbTry("bookings.resource.organization", () => getDrizzle().select({ organizationId: bookingsResources.organizationId }).from(bookingsResources).where(eq(bookingsResources.id, id)).limit(1))
      .pipe(Effect.map((rows) => rows[0]?.organizationId ?? null)),

  /** Créneaux libres d'une ressource du tenant pour une date locale ; `null` si introuvable. */
  availability: (resourceId: string, organizationId: string | null, date: string, options: { readonly notBefore?: Date } = {}) =>
    Effect.gen(function* () {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      const resource = first(yield* dbTry("bookings.availability.resource", () =>
        getDrizzle().select().from(bookingsResources).where(and(eq(bookingsResources.id, resourceId), tenant(bookingsResources.organizationId, organizationId))).limit(1)));
      if (!resource) return null;
      const dayStart = zonedToUtc(date, "00:00", resource.timezone);
      const busy = yield* dbTry("bookings.availability.busy", () =>
        getDrizzle().select({ id: bookings.id, start: bookings.startsAt, end: bookings.endsAt }).from(bookings).where(and(
          eq(bookings.resourceId, resource.id), inArray(bookings.status, [...ACTIVE_STATUSES]),
          lt(bookings.startsAt, new Date(dayStart.getTime() + 2 * DAY)), gt(bookings.endsAt, new Date(dayStart.getTime() - DAY)),
        )).orderBy(asc(bookings.startsAt)));
      const slots = resource.active ? freeSlots(date, resource.windows, resource.timezone, busy, resource.slotMinutes, options.notBefore) : [];
      return { resource, slots, busy } satisfies DayAvailability;
    }),
};

export const loadBooking = (id: string, organizationId: string | null) => runOrThrow(bookingsLoader.booking(id, organizationId));
export const loadBookingResource = (id: string, organizationId: string | null) => runOrThrow(bookingsLoader.resource(id, organizationId));
export const loadBookingResources = (organizationId: string | null, options?: { readonly activeOnly?: boolean }) => runOrThrow(bookingsLoader.resources(organizationId, options));
export const loadAvailability = (resourceId: string, organizationId: string | null, date: string, options?: { readonly notBefore?: Date }) =>
  runOrThrow(bookingsLoader.availability(resourceId, organizationId, date, options));
