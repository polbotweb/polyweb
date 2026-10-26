/**
 * Liste back-office des réservations (core/filters) : filtres lus dans l'URL canonique,
 * conditions SQL partagées par la liste, le total et les facettes, toujours dans le tenant.
 */
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { bookingAdminResource } from "../admin/resource";
import { BOOKING_STATUSES, type BookingStatus } from "../domain/workflow";
import { bookings, bookingsResources } from "../schema";

export interface BookingsAdminFilters {
  readonly search?: string;
  readonly status?: BookingStatus;
}

export function bookingsAdminFiltersFromUrl(params: URLSearchParams | string): BookingsAdminFilters {
  const { filters } = parseListUrlState(bookingAdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: BOOKING_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => "\\" + c);
const inTenant = (organizationId: string | null) => (organizationId === null ? isNull(bookings.organizationId) : eq(bookings.organizationId, organizationId));

export function bookingsAdminConditions(organizationId: string | null, filters: BookingsAdminFilters): SQL[] {
  const conditions: SQL[] = [inTenant(organizationId)];
  if (filters.search) {
    const pattern = "%" + escapeLike(filters.search) + "%";
    conditions.push(or(ilike(bookings.customerName, pattern), ilike(bookings.customerEmail, pattern), ilike(bookings.number, pattern), ilike(bookingsResources.name, pattern), ilike(bookingsResources.code, pattern))!);
  }
  if (filters.status) conditions.push(eq(bookings.status, filters.status));
  return conditions;
}

export const bookingsAdminFacets = (organizationId: string | null, filters: BookingsAdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: bookings.status, count: count() })
          .from(bookings)
          .leftJoin(bookingsResources, eq(bookingsResources.id, bookings.resourceId))
          .where(and(...bookingsAdminConditions(organizationId, without)))
          .groupBy(bookings.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

export type BookingsAdminRow = typeof bookings.$inferSelect & { readonly resourceName: string | null; readonly resourceCode: string | null; readonly resourceTimezone: string | null };

export const bookingsAdminList = (organizationId: string | null, params: URLSearchParams, pageSize = 50) => {
  const state = parseListUrlState(bookingAdminResource.list!, params);
  const filters = bookingsAdminFiltersFromUrl(params);
  const page = Math.max(1, state.page ?? 1);
  const direction = state.sort?.direction === "asc" ? asc : desc;
  const order =
    state.sort?.id === "number" ? [direction(bookings.number), desc(bookings.startsAt)]
      : state.sort?.id === "createdAt" ? [direction(bookings.createdAt)]
        : [direction(bookings.startsAt), desc(bookings.createdAt)];
  const where = and(...bookingsAdminConditions(organizationId, filters));
  return dbTry("bookings.adminList", async () => {
    const db = getDrizzle();
    const [rows, [total]] = await Promise.all([
      db.select({ booking: bookings, resourceName: bookingsResources.name, resourceCode: bookingsResources.code, resourceTimezone: bookingsResources.timezone }).from(bookings).leftJoin(bookingsResources, eq(bookingsResources.id, bookings.resourceId))
        .where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ value: count() }).from(bookings).leftJoin(bookingsResources, eq(bookingsResources.id, bookings.resourceId)).where(where),
    ]);
    const items: BookingsAdminRow[] = rows.map((row) => ({ ...row.booking, resourceName: row.resourceName, resourceCode: row.resourceCode, resourceTimezone: row.resourceTimezone }));
    const totalItems = Number(total?.value ?? 0);
    return { items, page, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)), total: totalItems, filters };
  });
};

export const loadBookingsAdminFacets = (organizationId: string | null, filters: BookingsAdminFilters) => runOrThrow(bookingsAdminFacets(organizationId, filters));
