/** Permissions du module blog (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

const admin = {
  blog: ["create", "read", "update", "delete", "publish", "moderate"],
  blogCategory: ["create", "read", "update", "delete"],
  blogTag: ["create", "read", "update", "delete"],
  blogComment: ["read", "update", "delete", "moderate"],
  blogReview: ["read", "update", "delete", "moderate"],
} as const;
const editor = {
  blog: ["create", "read", "update", "delete", "publish"],
  blogCategory: ["create", "read", "update", "delete"],
  blogTag: ["create", "read", "update", "delete"],
  blogComment: ["read", "update", "moderate"],
  blogReview: ["read", "update", "moderate"],
} as const;
const readOnly = { blog: ["read"], blogCategory: ["read"], blogTag: ["read"], blogComment: ["read"], blogReview: ["read"] } as const;

export const blogPermissions = defineModulePermissions({
  module: "blog",
  label: "Blog",
  statements: admin,
  grants: { admin, editor, user: readOnly, orgOwner: admin, orgAdmin: admin, orgMember: readOnly },
});
