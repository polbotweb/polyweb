/** Permissions du module formations (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const formationsPermissions = defineModulePermissions({
  module: "formations",
  label: "Formations",
  statements: { formations: ["create", "read", "update", "delete", "publish"] },
  grants: {
    admin: { formations: ["create", "read", "update", "delete", "publish"] },
    editor: { formations: ["create", "read", "update", "delete", "publish"] },
    user: { formations: ["read"] },
    orgOwner: { formations: ["create", "read", "update", "delete", "publish"] },
    orgAdmin: { formations: ["create", "read", "update", "delete", "publish"] },
    orgMember: { formations: ["read"] },
  },
});
