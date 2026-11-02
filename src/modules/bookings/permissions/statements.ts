/** Permissions du module bookings (registre core `permissions/registry`). Sans import serveur : chargé côté client. */
import { defineModulePermissions } from "@/core/permissions/registry";

export const bookingsPermissions = defineModulePermissions({
  module: "bookings",
  label: "Réservations",
  statements: { bookings: ["create", "read", "update", "delete"] },
  grants: {
    admin: { bookings: ["create", "read", "update", "delete"] },
    orgOwner: { bookings: ["create", "read", "update", "delete"] },
    orgAdmin: { bookings: ["create", "read", "update", "delete"] },
    orgMember: { bookings: ["read"] },
  },
});
