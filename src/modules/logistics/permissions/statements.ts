/** Permissions du module logistics (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const logisticsPermissions = defineModulePermissions({
  module: "logistics",
  label: "Logistique",
  statements: { logistics: ["create", "read", "update", "delete"] },
  grants: {
    admin: { logistics: ["create", "read", "update", "delete"] },
    orgOwner: { logistics: ["create", "read", "update", "delete"] },
    orgAdmin: { logistics: ["create", "read", "update", "delete"] },
    orgMember: { logistics: ["read"] },
  },
});
