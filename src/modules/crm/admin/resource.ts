import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";
import { assertResourceCompatibility, type AdminResourceDefinition } from "@/lib/cms/resource-contract";
import { crmModule } from "@/modules/crm/module";
import { CRM_STAGES } from "@/modules/crm/domain/workflow";

/**
 * Liste back-office des opportunités (filtres/tris lus dans l'URL, facettes par étape,
 * vues enregistrées via `src/lib/admin/list-registry.ts`, actions groupées `actions/bulk.ts`).
 */
const opportunityListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "search" },
    { id: "status", kind: "select", queryParam: "status", options: [...CRM_STAGES], facet: true },
  ],
  sorts: [
    { id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "amount", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "expectedCloseDate", queryParam: "sortBy", directions: ["asc", "desc"] },
  ],
  defaultSort: "createdAt",
  selection: true,
  bulkActions: [
    { id: "qualify", permission: "crm:update" },
    { id: "lose", permission: "crm:update", confirmationKey: "crm.bulk.lose" },
  ],
  facets: true,
  savedViews: true,
} as const;

assertAdminResourceListDefinition(opportunityListDefinition);

export const opportunityAdminResource: AdminResourceDefinition = {
  id: "opportunity",
  entity: "opportunity",
  management: { list: true, search: true, filters: true, sort: true, pagination: true, stats: true, selection: true },
  list: opportunityListDefinition,
  actions: { create: true, read: true, update: true, duplicate: false, publish: false, unpublish: false, archive: false, restore: false, delete: true, bulk: true },
  presentation: { card: ["default"], list: ["default"], single: ["default"] },
  permissionNamespace: "crm",
};

assertResourceCompatibility(crmModule, opportunityAdminResource);
