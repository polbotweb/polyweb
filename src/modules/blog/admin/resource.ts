import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";
import { assertResourceCompatibility, type AdminResourceDefinition } from "@/lib/cms/resource-contract";
import { blogModule } from "@/modules/blog/module";

const blogPostListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "search" },
    { id: "status", kind: "select", queryParam: "status" },
    { id: "category", kind: "select", queryParam: "categoryId" },
    { id: "tag", kind: "select", queryParam: "tagId" },
    { id: "author", kind: "select", queryParam: "authorId" },
    { id: "featured", kind: "boolean", queryParam: "featured" },
    { id: "sticky", kind: "boolean", queryParam: "sticky" },
    { id: "locale", kind: "select", queryParam: "locale" },
  ],
  sorts: [
    { id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "updatedAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "publishedAt", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "title", queryParam: "sortBy", directions: ["asc", "desc"] },
    { id: "viewCount", queryParam: "sortBy", directions: ["asc", "desc"] },
  ],
  defaultSort: "updatedAt",
} as const;

assertAdminResourceListDefinition(blogPostListDefinition);

export const blogPostAdminResource: AdminResourceDefinition = {
  id: "blog-post",
  entity: "blog_post",
  management: {
    list: true,
    search: true,
    filters: true,
    sort: true,
    pagination: true,
    stats: true,
  },
  list: blogPostListDefinition,
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
    card: ["default", "compact"],
    list: ["default", "dense"],
    single: ["default"],
  },
  permissionNamespace: "blog",
};

assertResourceCompatibility(blogModule, blogPostAdminResource);
