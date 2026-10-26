import type { PolywebModuleCapabilityProviders, PolywebModuleDefinition } from "@/core/modules/module-contract";
import { assertModuleCapabilityProviders, defineModuleCapabilities, defineModuleCapabilityProviders, defineModulePresentations } from "@/core/modules/module-contract";
import { purchasingCapabilityProviders } from "./capabilities";

/** Module achats : fournisseurs, commandes fournisseur, réceptions de marchandises (entrées en stock). Toutes les capacités sont explicites. */
export const purchasingModule: PolywebModuleDefinition = {
  id: "purchasing",
  entity: "purchaseOrder",
  capabilities: defineModuleCapabilities({
    content: true, localization: false, media: false, seo: false, taxonomy: false, attributes: false, search: false,
    publication: true, revisions: true, locks: true, engagement: false, moderation: false, notifications: false, audit: false, cache: false,
  }),
  capabilityProviders: defineModuleCapabilityProviders(purchasingCapabilityProviders satisfies PolywebModuleCapabilityProviders),
  presentations: defineModulePresentations({ card: ["default"], list: ["default"], single: ["default"], ui: [] }),
};

assertModuleCapabilityProviders(purchasingModule);
