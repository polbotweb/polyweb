/** Permissions du module shop (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const shopPermissions = defineModulePermissions({
  module: "shop",
  label: "Boutique",
  statements: { shop: ["create", "read", "update", "delete", "publish"] },
  grants: {
    admin: { shop: ["create", "read", "update", "delete", "publish"] },
    editor: { shop: ["create", "read", "update", "delete", "publish"] },
    user: { shop: ["read"] },
    orgOwner: { shop: ["create", "read", "update", "delete", "publish"] },
    orgAdmin: { shop: ["create", "read", "update", "delete", "publish"] },
    orgMember: { shop: ["read"] },
  },
});
