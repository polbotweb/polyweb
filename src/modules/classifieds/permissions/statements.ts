/** Permissions du module classifieds (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

const all = { classifieds: ["create", "read", "update", "delete", "moderate", "configure"] } as const;
const moderator = { classifieds: ["read", "moderate"] } as const;
const readOnly = { classifieds: ["read"] } as const;

export const classifiedsPermissions = defineModulePermissions({
  module: "classifieds",
  label: "Petites annonces",
  statements: all,
  grants: { admin: all, editor: moderator, user: readOnly, orgOwner: all, orgAdmin: all, orgMember: readOnly },
});
