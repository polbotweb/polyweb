import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";
import { assertResourceCompatibility, type AdminResourceDefinition } from "@/lib/cms/resource-contract";
import { logisticsModule } from "@/modules/logistics/module";
import { SHIPMENT_STATUSES } from "@/modules/logistics/domain/workflow";

/**
 * Liste back-office des expéditions (filtres/tris lus dans l'URL, facettes par statut,
 * vues enregistrées via `src/lib/admin/list-registry.ts`, actions groupées `actions/bulk.ts`).
 */
const shipmentListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "search" },
    { id: "status", kind: "select", queryParam: "status", options: [...SHIPMENT_STATUSES], facet: true },
  ],
  sorts: [
    { id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "number", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "shippedAt", queryParam: "sortBy", directions: ["asc", "desc"] },
  ],
  defaultSort: "createdAt",
  selection: true,
  bulkActions: [
    { id: "cancel", permission: "logistics:update", confirmationKey: "logistics.bulk.cancel" },
    { id: "deliver", permission: "logistics:update" },
  ],
  facets: true,
  savedViews: true,
} as const;

assertAdminResourceListDefinition(shipmentListDefinition);

export const shipmentAdminResource: AdminResourceDefinition = {
  id: "shipment",
  entity: "shipment",
  management: { list: true, search: true, filters: true, sort: true, pagination: true, stats: true, selection: true },
  list: shipmentListDefinition,
  actions: { create: true, read: true, update: true, duplicate: false, publish: false, unpublish: false, archive: false, restore: false, delete: true, bulk: true },
  presentation: { card: ["default"], list: ["default"], single: ["default"] },
  permissionNamespace: "logistics",
};

assertResourceCompatibility(logisticsModule, shipmentAdminResource);
