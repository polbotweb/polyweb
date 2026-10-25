import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";
import { assertResourceCompatibility, type AdminResourceDefinition } from "@/lib/cms/resource-contract";
import { eventsModule } from "@/modules/events/module";
import { EVENTS_STATUSES } from "@/modules/events/domain/workflow";

/**
 * Définition de la liste back-office.
 *
 * Chaque filtre et chaque tri porte un `queryParam` : c'est lui que la liste
 * lit dans l'URL, ce qui rend une vue filtrée partageable par lien.
 * `assertAdminResourceListDefinition` valide qu'aucun identifiant n'est
 * dupliqué et que `defaultSort` désigne un tri déclaré.
 *
 * Facettes et vues enregistrées (core/filters) : le filtre `status` est compté par
 * `eventsAdminFacets` (loaders/event-admin.loader.ts) ; les vues enregistrées
 * exigent l'inscription de la ressource dans `src/lib/admin/list-registry.ts`.
 */
const eventListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "search" },
    { id: "status", kind: "select", queryParam: "status", options: [...EVENTS_STATUSES], facet: true },
    { id: "category", kind: "select", queryParam: "categoryId", facet: true },
  ],
  sorts: [{ id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] }],
  defaultSort: "createdAt",
  // Actions groupées (core/bulk, `actions/bulk.ts`) : ids = opérations du moteur ;
  // la barre générique `AdminBulkBar` les affiche (confirmation si archive).
  selection: true,
  bulkActions: [
    { id: "publish", permission: "events:publish" },
    { id: "unpublish", permission: "events:publish" },
    { id: "archive", permission: "events:update", confirmationKey: "events.bulk.archive" },
    { id: "restore", permission: "events:update" },
  ],
  facets: true,
  savedViews: true,
} as const;

assertAdminResourceListDefinition(eventListDefinition);

/**
 * Ressource back-office.
 *
 * La forme suit `modules/blog/admin/resource.ts` à la lettre : c'est la
 * référence la plus complète du dépôt. `actions` déclare ce que le
 * back-office sait faire — une action absente retire le bouton correspondant —
 * et `permissionNamespace` détermine les droits vérifiés par les loaders.
 */
export const eventAdminResource: AdminResourceDefinition = {
  id: "event",
  entity: "event",
  management: {
    list: true,
    search: true,
    filters: true,
    sort: true,
    pagination: true,
    stats: false,
    selection: true,
  },
  list: eventListDefinition,
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
  permissionNamespace: "events",
};

// Échoue au chargement si la ressource et le module se contredisent.
assertResourceCompatibility(eventsModule, eventAdminResource);
