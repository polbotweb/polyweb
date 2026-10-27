import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/** Une entrée par capacité ACTIVÉE dans `module.ts` (table ou workflow qui la porte). */
export const bookingsCapabilityProviders = {
  content: "bookings + bookings_resources (plages hebdomadaires, core/scheduling)",
  publication: "bookingWorkflow (REQUESTED → CONFIRMED → CHECKED_IN → COMPLETED, CANCELLED, NO_SHOW, EXPIRED)",
  revisions: "bookings_revisions",
  locks: "bookings_locks",
} as unknown as PolywebModuleCapabilityProviders;
