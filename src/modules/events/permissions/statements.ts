/** Permissions du module events (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const eventsPermissions = defineModulePermissions({
  module: "events",
  label: "Événements",
  statements: { events: ["create", "read", "update", "delete", "publish"] },
  grants: {
    admin: { events: ["create", "read", "update", "delete", "publish"] },
    editor: { events: ["create", "read", "update", "delete", "publish"] },
    user: { events: ["read"] },
    orgOwner: { events: ["create", "read", "update", "delete", "publish"] },
    orgAdmin: { events: ["create", "read", "update", "delete", "publish"] },
    orgMember: { events: ["read"] },
  },
});
