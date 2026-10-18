/** Définition de liste admin des pages (core/filters) : filtres d'URL, tris, vues enregistrées. */
import { assertAdminResourceListDefinition, type AdminResourceListDefinition } from "@/core/admin/filter-contract";
import { LOCALES } from "@i18n/config";

export const pagesListDefinition: AdminResourceListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "q" },
    { id: "status", kind: "select", queryParam: "status", options: ["published", "draft"], facet: true },
    { id: "template", kind: "select", queryParam: "template", options: ["default", "legal"], facet: true },
    { id: "locale", kind: "select", queryParam: "locale", options: [...LOCALES], facet: true },
  ],
  sorts: [
    { id: "publishedAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "title", queryParam: "sortBy", directions: ["asc", "desc"] },
  ],
  defaultSort: "publishedAt",
  selection: true,
  facets: true,
  savedViews: true,
};

assertAdminResourceListDefinition(pagesListDefinition);
