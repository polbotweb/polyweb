import type { PolywebModuleCapabilityProviders, PolywebModuleDefinition } from "@/core/modules/module-contract";
import { assertModuleCapabilityProviders, defineModuleCapabilities, defineModuleCapabilityProviders, defineModulePresentations } from "@/core/modules/module-contract";
import { crmCapabilityProviders } from "./capabilities";

/** Module CRM : sociétés, contacts, opportunités (pipeline), activités. Toutes les capacités sont explicites. */
export const crmModule: PolywebModuleDefinition = {
  id: "crm",
  entity: "opportunity",
  capabilities: defineModuleCapabilities({
    content: true, localization: false, media: false, seo: false, taxonomy: false, attributes: false, search: false,
    publication: true, revisions: true, locks: true, engagement: false, moderation: false, notifications: false, audit: false, cache: false,
  }),
  capabilityProviders: defineModuleCapabilityProviders(crmCapabilityProviders satisfies PolywebModuleCapabilityProviders),
  presentations: defineModulePresentations({ card: ["default"], list: ["default"], single: ["default"], ui: [] }),
};

assertModuleCapabilityProviders(crmModule);
