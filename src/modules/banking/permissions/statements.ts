/** Permissions du module banking (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

const all = { "banking": ["create", "read", "update", "publish", "delete"] } as const;
const readOnly = { "banking": ["read"] } as const;

export const bankingPermissions = defineModulePermissions({
  module: "banking",
  label: "Banking",
  statements: all,
  // Rôles prédéfinis : ajuster si le module est éditorial (editor / user) ou métier (admin seulement).
  grants: { admin: all, orgOwner: all, orgAdmin: all, orgMember: readOnly },
});
