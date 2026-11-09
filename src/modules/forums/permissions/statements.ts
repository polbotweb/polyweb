/** Permissions du module forums (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

/** `moderate` : signalements, verrouillage/épinglage/déplacement ; `configure` : catégories, étiquettes, sanctions. */
const all = { forums: ["create", "read", "update", "publish", "delete", "moderate", "configure"] } as const;
const moderator = { forums: ["read", "moderate"] } as const;
const readOnly = { forums: ["read"] } as const;

export const forumsPermissions = defineModulePermissions({
  module: "forums",
  label: "Forums",
  statements: all,
  grants: { admin: all, editor: moderator, user: readOnly, orgOwner: all, orgAdmin: all, orgMember: readOnly },
});
