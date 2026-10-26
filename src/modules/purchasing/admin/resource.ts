import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";
import { assertResourceCompatibility, type AdminResourceDefinition } from "@/lib/cms/resource-contract";
import { purchasingModule } from "@/modules/purchasing/module";
import { PURCHASE_ORDER_STATUSES } from "@/modules/purchasing/domain/workflow";

/**
 * Liste back-office des commandes fournisseur (filtres/tris lus dans l'URL, facettes par statut,
 * vues enregistrées via `src/lib/admin/list-registry.ts`, actions groupées `actions/bulk.ts`).
 */
const purchaseOrderListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "search" },
    { id: "status", kind: "select", queryParam: "status", options: [...PURCHASE_ORDER_STATUSES], facet: true },
  ],
  sorts: [
    { id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "number", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "expectedDate", queryParam: "sortBy", directions: ["asc", "desc"] },
  ],
  defaultSort: "createdAt",
  selection: true,
  bulkActions: [
    { id: "cancel", permission: "purchasing:update", confirmationKey: "purchasing.bulk.cancel" },
    { id: "close", permission: "purchasing:update" },
  ],
  facets: true,
  savedViews: true,
} as const;

assertAdminResourceListDefinition(purchaseOrderListDefinition);

export const purchaseOrderAdminResource: AdminResourceDefinition = {
  id: "purchaseOrder",
  entity: "purchaseOrder",
  management: { list: true, search: true, filters: true, sort: true, pagination: true, stats: true, selection: true },
  list: purchaseOrderListDefinition,
  actions: { create: true, read: true, update: true, duplicate: false, publish: false, unpublish: false, archive: false, restore: false, delete: true, bulk: true },
  presentation: { card: ["default"], list: ["default"], single: ["default"] },
  permissionNamespace: "purchasing",
};

assertResourceCompatibility(purchasingModule, purchaseOrderAdminResource);
