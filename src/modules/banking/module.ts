import type { PolywebModuleCapabilityProviders, PolywebModuleDefinition } from "@/core/modules/module-contract";
import { assertModuleCapabilityProviders, defineModuleCapabilities, defineModuleCapabilityProviders, defineModulePresentations } from "@/core/modules/module-contract";
import { bankingCapabilityProviders } from "./capabilities";

/**
 * Module banque : comptes bancaires, imports de relevés (CAMT, MT940/942, CFONB 120, OFX, QIF, CSV),
 * flux bancaires (GoCardless, désactivés par défaut), rapprochement assisté (moteur core/reconciliation,
 * règles, approbations), grand livre banque repris dans le FEC, versements Stripe.
 * Documentation A–Z (tous profils) : `docs/banking.md` ; plan comptable : `docs/accounting.md`.
 * Pages strictement admin `/{lang}/admin/banking` et `/{lang}/admin/accounting` ; aucune page publique.
 */
export const bankingModule: PolywebModuleDefinition = {
  id: "banking",
  entity: "bankTransaction",
  capabilities: defineModuleCapabilities({
    content: true, localization: false, media: false, seo: false, taxonomy: false, attributes: false, search: false,
    publication: false, revisions: false, locks: false, engagement: false, moderation: false, notifications: true, audit: true, cache: false,
  }),
  capabilityProviders: defineModuleCapabilityProviders(bankingCapabilityProviders satisfies PolywebModuleCapabilityProviders),
  presentations: defineModulePresentations({ card: [], list: ["default"], single: ["default"], ui: [] }),
};

assertModuleCapabilityProviders(bankingModule);
