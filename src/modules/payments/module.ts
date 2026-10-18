import type { PolywebModuleDefinition } from "@/core/modules/module-contract";
import { assertModuleCapabilityProviders, defineModuleCapabilities, defineModuleCapabilityProviders, defineModulePresentations } from "@/core/modules/module-contract";

/** Module optionnel : enregistré seulement si PAYMENTS_ENABLED=true (voir bootstrap). */
export const paymentsModule: PolywebModuleDefinition = {
  id: "payments",
  entity: "payment",
  capabilities: defineModuleCapabilities({ content: false, localization: false, media: false, seo: false, taxonomy: false, attributes: false, search: false, publication: false, revisions: false, locks: false, engagement: false, moderation: false, notifications: false, audit: true, cache: false }),
  capabilityProviders: defineModuleCapabilityProviders({ content: "", localization: "", media: "", seo: "", taxonomy: "", attributes: "", search: "", publication: "", revisions: "", locks: "", engagement: "", moderation: "", notifications: "", audit: "audit_log (PAYMENT_*)", cache: "" }),
  presentations: defineModulePresentations({ card: [], list: ["admin"], single: [], ui: [] }),
};

assertModuleCapabilityProviders(paymentsModule);
