import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";
import { assertResourceCompatibility, type AdminResourceDefinition } from "@/core/admin/resource-contract";
import { servicesModule } from "../module";

const serviceListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "search" },
    { id: "status", kind: "select", queryParam: "status" },
    { id: "category", kind: "select", queryParam: "categoryId" },
    { id: "tag", kind: "select", queryParam: "tagId" },
    { id: "provider", kind: "select", queryParam: "providerId" },
    { id: "featured", kind: "boolean", queryParam: "featured" },
    { id: "mobile", kind: "boolean", queryParam: "mobile" },
    { id: "locale", kind: "select", queryParam: "locale" },
  ],
  sorts: [
    { id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "updatedAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "publishedAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "title", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "priceMinor", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "ratingAverage100", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "viewCount", queryParam: "sortBy", directions: ["asc", "desc"] },
  ],
  defaultSort: "updatedAt",
} as const;

assertAdminResourceListDefinition(serviceListDefinition);

export const serviceAdminResource: AdminResourceDefinition = {
  id: "service",
  entity: "service",
  management: { list: true, search: true, filters: true, sort: true, pagination: true, stats: true },
  list: serviceListDefinition,
  actions: {
    create: true,
    read: true,
    update: true,
    duplicate: true,
    publish: true,
    unpublish: true,
    archive: true,
    restore: true,
    delete: true,
    bulk: false,
  },
  presentation: {
    card: ["default", "compact", "featured", "horizontal"],
    list: ["default", "dense", "search"],
    single: ["default", "detail"],
  },
  permissionNamespace: "service",
};

assertResourceCompatibility(servicesModule, serviceAdminResource);
