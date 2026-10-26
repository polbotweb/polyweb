import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";
import { assertResourceCompatibility, type AdminResourceDefinition } from "@/lib/cms/resource-contract";
import { salesModule } from "@/modules/sales/module";
import { SALES_DOCUMENT_KINDS, SALES_STATUSES } from "@/modules/sales/domain/workflow";

/**
 * Définition de la liste back-office.
 *
 * Chaque filtre et chaque tri porte un `queryParam` : c'est lui que la liste
 * lit dans l'URL, ce qui rend une vue filtrée partageable par lien.
 * `assertAdminResourceListDefinition` valide qu'aucun identifiant n'est
 * dupliqué et que `defaultSort` désigne un tri déclaré.
 *
 * Facettes et vues enregistrées (core/filters) : les filtres `kind` et `status` sont comptés par
 * `salesAdminFacets` (loaders/salesDocument-admin.loader.ts) ; les vues enregistrées
 * exigent l'inscription de la ressource dans `src/lib/admin/list-registry.ts`.
 */
const salesDocumentListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "search" },
    { id: "kind", kind: "select", queryParam: "kind", options: [...SALES_DOCUMENT_KINDS], facet: true },
    { id: "status", kind: "select", queryParam: "status", options: [...SALES_STATUSES], facet: true },
  ],
  sorts: [
    { id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "number", queryParam: "sortBy", directions: ["asc", "desc"] },
  ],
  defaultSort: "createdAt",
  // Actions groupées (core/bulk, `actions/bulk.ts`) : ids = opérations du moteur ;
  // la barre générique `AdminBulkBar` les affiche (confirmation pour l'annulation).
  selection: true,
  bulkActions: [
    { id: "cancel", permission: "sales:update", confirmationKey: "sales.bulk.cancel" },
    { id: "expire", permission: "sales:update" },
  ],
  facets: true,
  savedViews: true,
} as const;

assertAdminResourceListDefinition(salesDocumentListDefinition);

/**
 * Ressource back-office.
 *
 * La forme suit `modules/blog/admin/resource.ts` à la lettre : c'est la
 * référence la plus complète du dépôt. `actions` déclare ce que le
 * back-office sait faire — une action absente retire le bouton correspondant —
 * et `permissionNamespace` détermine les droits vérifiés par les loaders.
 */
export const salesDocumentAdminResource: AdminResourceDefinition = {
  id: "salesDocument",
  entity: "salesDocument",
  management: {
    list: true,
    search: true,
    filters: true,
    sort: true,
    pagination: true,
    stats: false,
    selection: true,
  },
  list: salesDocumentListDefinition,
  actions: {
    create: true,
    read: true,
    update: true,
    duplicate: false,
    publish: false,
    unpublish: false,
    archive: false,
    restore: false,
    delete: false,
    bulk: true,
  },
  presentation: {
    card: ["default"],
    list: ["default"],
    single: ["default"],
  },
  permissionNamespace: "sales",
};

// Échoue au chargement si la ressource et le module se contredisent.
assertResourceCompatibility(salesModule, salesDocumentAdminResource);
