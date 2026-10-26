import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";
import { assertResourceCompatibility, type AdminResourceDefinition } from "@/lib/cms/resource-contract";
import { bookingsModule } from "@/modules/bookings/module";
import { BOOKING_STATUSES } from "@/modules/bookings/domain/workflow";

/**
 * Liste back-office des réservations (filtres/tris lus dans l'URL, facettes par statut,
 * vues enregistrées via `src/lib/admin/list-registry.ts`, actions groupées `actions/bulk.ts`).
 */
const bookingListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "search" },
    { id: "status", kind: "select", queryParam: "status", options: [...BOOKING_STATUSES], facet: true },
  ],
  sorts: [
    { id: "startsAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "number", queryParam: "sortBy", directions: ["asc", "desc"] },
  ],
  defaultSort: "startsAt",
  selection: true,
  bulkActions: [
    { id: "cancel", permission: "bookings:update", confirmationKey: "bookings.bulk.cancel" },
    { id: "noShow", permission: "bookings:update" },
    { id: "complete", permission: "bookings:update" },
  ],
  facets: true,
  savedViews: true,
} as const;

assertAdminResourceListDefinition(bookingListDefinition);

export const bookingAdminResource: AdminResourceDefinition = {
  id: "booking",
  entity: "booking",
  management: { list: true, search: true, filters: true, sort: true, pagination: true, stats: true, selection: true },
  list: bookingListDefinition,
  actions: { create: true, read: true, update: true, duplicate: false, publish: false, unpublish: false, archive: false, restore: false, delete: true, bulk: true },
  presentation: { card: ["default"], list: ["default"], single: ["default"] },
  permissionNamespace: "bookings",
};

assertResourceCompatibility(bookingsModule, bookingAdminResource);
