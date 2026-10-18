import type { AtomicModuleDefinition } from "@/core/modules";
import { assertModuleCapabilityProviders, defineModuleCapabilities, defineModuleCapabilityProviders, defineModulePresentations } from "@/core/modules";
import { servicesCapabilityProviders } from "./capabilities";
import { servicesSearchDefinition } from "./search";

export const servicesModule: AtomicModuleDefinition = {
  id: "services",
  entity: "service",
  capabilities: defineModuleCapabilities({ content: true, localization: true, media: true, seo: true, taxonomy: true, attributes: true, search: true, publication: true, revisions: true, locks: true, engagement: true, moderation: true, notifications: true, audit: true, cache: true }),
  capabilityProviders: defineModuleCapabilityProviders(servicesCapabilityProviders),
  presentations: defineModulePresentations({ card: ["default", "compact", "featured", "horizontal"], list: ["default", "dense", "search"], single: ["default", "detail"], ui: ["price", "rating", "meta", "taxonomy", "availability", "provider"] }),
  searchDefinition: servicesSearchDefinition,
};

assertModuleCapabilityProviders(servicesModule);