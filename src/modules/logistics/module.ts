import type { PolywebModuleCapabilityProviders, PolywebModuleDefinition } from "@/core/modules/module-contract";
import { assertModuleCapabilityProviders, defineModuleCapabilities, defineModuleCapabilityProviders, defineModulePresentations } from "@/core/modules/module-contract";
import { logisticsCapabilityProviders } from "./capabilities";

/** Module logistique : entrepôts, articles, journal de stock, expéditions (bons de livraison). Toutes les capacités sont explicites. */
export const logisticsModule: PolywebModuleDefinition = {
  id: "logistics",
  entity: "shipment",
  capabilities: defineModuleCapabilities({
    content: true, localization: false, media: false, seo: false, taxonomy: false, attributes: false, search: false,
    publication: true, revisions: true, locks: true, engagement: false, moderation: false, notifications: false, audit: false, cache: false,
  }),
  capabilityProviders: defineModuleCapabilityProviders(logisticsCapabilityProviders satisfies PolywebModuleCapabilityProviders),
  presentations: defineModulePresentations({ card: ["default"], list: ["default"], single: ["default"], ui: [] }),
};

assertModuleCapabilityProviders(logisticsModule);
