import type { SearchResourceDefinition } from "@/core/search";
import { assertSearchResourceDefinition } from "@/core/search";

export const blogSearchDefinition: SearchResourceDefinition = {
  resourceId: "blog-post",
  defaultSort: "publishedAt",
  fields: [
    { name: "title", kind: "text", searchable: true, sortable: true },
    { name: "slug", kind: "keyword", searchable: true, filterable: true, sortable: true },
    { name: "content", kind: "text", searchable: true },
    { name: "excerpt", kind: "text", searchable: true },
    { name: "status", kind: "keyword", filterable: true, sortable: true },
    { name: "authorId", kind: "keyword", filterable: true, sortable: true },
    { name: "categoryId", kind: "keyword", filterable: true },
    { name: "tagId", kind: "keyword", filterable: true },
    { name: "isFeatured", kind: "boolean", filterable: true, sortable: true },
    { name: "isSticky", kind: "boolean", filterable: true, sortable: true },
    { name: "publishedAt", kind: "date", filterable: true, sortable: true },
    { name: "viewCount", kind: "number", sortable: true },
  ],
};

assertSearchResourceDefinition(blogSearchDefinition);
