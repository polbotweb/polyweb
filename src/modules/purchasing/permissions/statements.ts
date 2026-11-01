/** Permissions du module purchasing (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const purchasingPermissions = defineModulePermissions({
  module: "purchasing",
  label: "Achats",
  statements: { purchasing: ["create", "read", "update", "delete"] },
  grants: {
    admin: { purchasing: ["create", "read", "update", "delete"] },
    orgOwner: { purchasing: ["create", "read", "update", "delete"] },
    orgAdmin: { purchasing: ["create", "read", "update", "delete"] },
    orgMember: { purchasing: ["read"] },
  },
});
