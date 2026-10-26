import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";
import { assertResourceCompatibility, type AdminResourceDefinition } from "@/lib/cms/resource-contract";
import { taxModule } from "@/modules/tax/module";
import { TAX_STATUSES } from "@/modules/tax/domain/workflow";
import { EU_COUNTRIES, TAX_CATEGORIES } from "@/modules/tax/domain/rules";

/**
 * Définition de la liste back-office.
 *
 * Chaque filtre et chaque tri porte un `queryParam` : c'est lui que la liste
 * lit dans l'URL, ce qui rend une vue filtrée partageable par lien.
 * `assertAdminResourceListDefinition` valide qu'aucun identifiant n'est
 * dupliqué et que `defaultSort` désigne un tri déclaré.
 *
 * Facettes et vues enregistrées (core/filters) : les filtres `status`, `country` et `category` sont comptés par
 * `taxAdminFacets` (loaders/tax-rate-admin.loader.ts) ; les vues enregistrées
 * exigent l'inscription de la ressource dans `src/lib/admin/list-registry.ts`.
 */
const taxRateListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "search" },
    { id: "status", kind: "select", queryParam: "status", options: [...TAX_STATUSES], facet: true },
    { id: "country", kind: "select", queryParam: "country", options: [...EU_COUNTRIES], facet: true },
    { id: "category", kind: "select", queryParam: "category", options: [...TAX_CATEGORIES], facet: true },
  ],
  sorts: [
    { id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "countryCode", queryParam: "sortBy", directions: ["asc", "desc"] },
  ],
  defaultSort: "createdAt",
  // Actions groupées (core/bulk, `actions/bulk.ts`) : ids = opérations du moteur ;
  // la barre générique `AdminBulkBar` les affiche (confirmation si archive).
  selection: true,
  bulkActions: [
    { id: "publish", permission: "tax:publish" },
    { id: "unpublish", permission: "tax:publish" },
    { id: "archive", permission: "tax:update", confirmationKey: "tax.bulk.archive" },
    { id: "restore", permission: "tax:update" },
  ],
  facets: true,
  savedViews: true,
} as const;

assertAdminResourceListDefinition(taxRateListDefinition);

/**
 * Ressource back-office.
 *
 * La forme suit `modules/blog/admin/resource.ts` à la lettre : c'est la
 * référence la plus complète du dépôt. `actions` déclare ce que le
 * back-office sait faire — une action absente retire le bouton correspondant —
 * et `permissionNamespace` détermine les droits vérifiés par les loaders.
 */
export const taxRateAdminResource: AdminResourceDefinition = {
  id: "tax-rate",
  entity: "tax-rate",
  management: {
    list: true,
    search: true,
    filters: true,
    sort: true,
    pagination: true,
    stats: false,
    selection: true,
  },
  list: taxRateListDefinition,
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
  permissionNamespace: "tax",
};

// Échoue au chargement si la ressource et le module se contredisent.
assertResourceCompatibility(taxModule, taxRateAdminResource);
