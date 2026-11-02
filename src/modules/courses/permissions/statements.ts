/** Permissions du module courses (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const coursesPermissions = defineModulePermissions({
  module: "courses",
  label: "Cours",
  statements: { courses: ["create", "read", "update", "delete", "publish"] },
  grants: {
    admin: { courses: ["create", "read", "update", "delete", "publish"] },
    editor: { courses: ["create", "read", "update", "delete", "publish"] },
    user: { courses: ["read"] },
    orgOwner: { courses: ["create", "read", "update", "delete", "publish"] },
    orgAdmin: { courses: ["create", "read", "update", "delete", "publish"] },
    orgMember: { courses: ["read"] },
  },
});
