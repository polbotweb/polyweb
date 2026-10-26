import type { PolywebModuleCapabilityProviders, PolywebModuleDefinition } from "@/core/modules/module-contract";
import { assertModuleCapabilityProviders, defineModuleCapabilities, defineModuleCapabilityProviders, defineModulePresentations } from "@/core/modules/module-contract";
import { bookingsCapabilityProviders } from "./capabilities";

/** Module réservations : ressources réservables (plages d'ouverture, fuseau) et réservations sans chevauchement. Toutes les capacités sont explicites. */
export const bookingsModule: PolywebModuleDefinition = {
  id: "bookings",
  entity: "booking",
  capabilities: defineModuleCapabilities({
    content: true, localization: false, media: false, seo: false, taxonomy: false, attributes: false, search: false,
    publication: true, revisions: true, locks: true, engagement: false, moderation: false, notifications: false, audit: false, cache: false,
  }),
  capabilityProviders: defineModuleCapabilityProviders(bookingsCapabilityProviders satisfies PolywebModuleCapabilityProviders),
  presentations: defineModulePresentations({ card: ["default"], list: ["default"], single: ["default"], ui: [] }),
};

assertModuleCapabilityProviders(bookingsModule);
