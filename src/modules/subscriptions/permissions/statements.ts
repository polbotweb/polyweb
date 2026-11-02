/** Permissions du module subscriptions (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const subscriptionsPermissions = defineModulePermissions({
  module: "subscriptions",
  label: "Abonnements",
  statements: { subscriptions: ["create", "read", "update", "delete"] },
  grants: {
    admin: { subscriptions: ["create", "read", "update", "delete"] },
    orgOwner: { subscriptions: ["create", "read", "update", "delete"] },
    orgAdmin: { subscriptions: ["create", "read", "update", "delete"] },
    orgMember: { subscriptions: ["read"] },
  },
});
