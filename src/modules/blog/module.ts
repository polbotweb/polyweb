import type { AtomicModuleCapabilityProviders, AtomicModuleDefinition } from "@/core/modules";
import { assertModuleCapabilityProviders, defineModuleCapabilities, defineModuleCapabilityProviders, defineModulePresentations } from "@/core/modules";
import { blogCapabilityProviders } from "@/modules/blog/capabilities";
import { blogSearchDefinition } from "@/modules/blog/search";

export const blogModule: AtomicModuleDefinition = {
  id: "blog",
  entity: "blog_post",
  capabilities: defineModuleCapabilities({ content: true, localization: true, media: true, seo: true, taxonomy: true, attributes: false, search: true, publication: true, revisions: true, locks: true, engagement: true, moderation: true, notifications: true, audit: true, cache: true }),
  capabilityProviders: defineModuleCapabilityProviders(blogCapabilityProviders satisfies AtomicModuleCapabilityProviders),
  presentations: defineModulePresentations({ card: ["default", "compact", "featured"], list: ["default", "dense", "search"], single: ["default", "reader"], ui: ["author", "meta", "rating", "taxonomy", "publication"] }),
  searchDefinition: blogSearchDefinition,
};

assertModuleCapabilityProviders(blogModule);