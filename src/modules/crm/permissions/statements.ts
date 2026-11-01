/** Permissions du module crm (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const crmPermissions = defineModulePermissions({
  module: "crm",
  label: "CRM",
  statements: { crm: ["create", "read", "update", "delete"] },
  grants: {
    admin: { crm: ["create", "read", "update", "delete"] },
    orgOwner: { crm: ["create", "read", "update", "delete"] },
    orgAdmin: { crm: ["create", "read", "update", "delete"] },
    orgMember: { crm: ["read"] },
  },
});
