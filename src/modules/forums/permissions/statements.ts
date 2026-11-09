/** Permissions du module forums (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

const all = { "forums": ["create", "read", "update", "publish", "delete"] } as const;
const readOnly = { "forums": ["read"] } as const;

export const forumsPermissions = defineModulePermissions({
  module: "forums",
  label: "Forums",
  statements: all,
  // Rôles prédéfinis : ajuster si le module est éditorial (editor / user) ou métier (admin seulement).
  grants: { admin: all, orgOwner: all, orgAdmin: all, orgMember: readOnly },
});
