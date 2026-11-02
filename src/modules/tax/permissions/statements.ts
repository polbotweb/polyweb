/** Permissions du module tax (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const taxPermissions = defineModulePermissions({
  module: "tax",
  label: "Fiscalité",
  statements: { tax: ["create", "read", "update", "delete", "publish"] },
  grants: {
    admin: { tax: ["create", "read", "update", "delete", "publish"] },
    editor: { tax: ["create", "read", "update", "delete", "publish"] },
    user: { tax: ["read"] },
    orgOwner: { tax: ["create", "read", "update", "delete", "publish"] },
    orgAdmin: { tax: ["create", "read", "update", "delete", "publish"] },
    orgMember: { tax: ["read"] },
  },
});
