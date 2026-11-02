/** Permissions du module services (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

const admin = {
  service: ["create", "read", "update", "delete", "publish", "moderate"],
  serviceCategory: ["create", "read", "update", "delete"],
  serviceTag: ["create", "read", "update", "delete"],
  serviceComment: ["read", "update", "delete", "moderate"],
  serviceReview: ["read", "update", "delete", "moderate"],
} as const;
const editor = {
  service: ["create", "read", "update", "delete", "publish"],
  serviceCategory: ["create", "read", "update", "delete"],
  serviceTag: ["create", "read", "update", "delete"],
  serviceComment: ["read", "update", "moderate"],
  serviceReview: ["read", "update", "moderate"],
} as const;
const readOnly = { service: ["read"], serviceCategory: ["read"], serviceTag: ["read"], serviceComment: ["read"], serviceReview: ["read"] } as const;

export const servicesPermissions = defineModulePermissions({
  module: "services",
  label: "Services",
  statements: admin,
  grants: { admin, editor, user: readOnly, orgOwner: admin, orgAdmin: admin, orgMember: readOnly },
});
