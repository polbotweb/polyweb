import type {
  PolywebModuleCapabilityProviders,
  PolywebModuleDefinition,
} from "@/core/modules/module-contract";
import {
  assertModuleCapabilityProviders,
  defineModuleCapabilities,
  defineModuleCapabilityProviders,
  defineModulePresentations,
} from "@/core/modules/module-contract";
import { classifiedsCapabilityProviders } from "./capabilities";
import { classifiedsSearchDefinition } from "./search";

export const classifiedsModule: PolywebModuleDefinition = {
  id: "classifieds",
  entity: "ad",
  capabilities: defineModuleCapabilities({
    content: true,
    localization: true,
    media: true,
    seo: true,
    taxonomy: false,
    attributes: true,
    search: true,
    publication: true,
    revisions: false,
    locks: false,
    engagement: true,
    moderation: true,
    notifications: true,
    audit: true,
    cache: false,
  }),
  capabilityProviders: defineModuleCapabilityProviders(
    classifiedsCapabilityProviders satisfies PolywebModuleCapabilityProviders,
  ),
  presentations: defineModulePresentations({
    card: ["default"],
    list: ["default"],
    single: ["default"],
    ui: [],
  }),
  searchDefinition: classifiedsSearchDefinition,
};

assertModuleCapabilityProviders(classifiedsModule);
