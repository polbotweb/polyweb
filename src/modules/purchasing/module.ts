import type { PolywebModuleCapabilityProviders, PolywebModuleDefinition } from "@/core/modules/module-contract";
import { assertModuleCapabilityProviders, defineModuleCapabilities, defineModuleCapabilityProviders, defineModulePresentations } from "@/core/modules/module-contract";
import { purchasingCapabilityProviders } from "./capabilities";

/** Module achats : fournisseurs, commandes, réceptions, factures, rapprochement, réassort, retours, SEPA, e-facture, punch-out.
 * Documentation A–Z (tous profils, 4 locales) : `docs/purchasing.md`. Journal FEC HA : `docs/fec.md`.
 * Capacités explicites. Pages strictement admin `/{lang}/admin/purchasing`. */
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
