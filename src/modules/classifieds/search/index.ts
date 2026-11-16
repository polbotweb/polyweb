import type { SearchResourceDefinition } from "@/core/search";

export const classifiedsSearchDefinition: SearchResourceDefinition = {
  resourceId: "classifieds.ad",
  defaultSort: "publishedAt",
  fields: [
    { name: "title", kind: "text", searchable: true },
    { name: "body", kind: "text", searchable: true },
    { name: "city", kind: "text", searchable: true, filterable: true },
    { name: "categoryId", kind: "keyword", filterable: true },
    { name: "kind", kind: "keyword", filterable: true },
    { name: "condition", kind: "keyword", filterable: true },
    { name: "priceMinor", kind: "number", filterable: true, sortable: true },
    { name: "publishedAt", kind: "date", sortable: true },
  ],
};
