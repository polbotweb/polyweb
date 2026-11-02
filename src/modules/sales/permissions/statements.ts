/** Permissions du module sales (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const salesPermissions = defineModulePermissions({
  module: "sales",
  label: "Ventes",
  statements: { sales: ["create", "read", "update", "delete", "issue", "payment"] },
  grants: {
    admin: { sales: ["create", "read", "update", "delete", "issue", "payment"] },
    orgOwner: { sales: ["create", "read", "update", "delete", "issue", "payment"] },
    orgAdmin: { sales: ["create", "read", "update", "delete", "issue", "payment"] },
    orgMember: { sales: ["read"] },
  },
});
