import type { PolywebModuleDefinition } from "@/core/modules/module-contract";
import { assertModuleCapabilityProviders, defineModuleCapabilities, defineModuleCapabilityProviders, defineModulePresentations } from "@/core/modules/module-contract";

/** Types de contenu dynamiques + entrées (briques a, b, f). */
export const contentModule: PolywebModuleDefinition = {
  id: "content",
  entity: "contentEntry",
  capabilities: defineModuleCapabilities({ content: true, localization: true, media: true, seo: true, taxonomy: false, attributes: true, search: false, publication: true, revisions: true, locks: false, engagement: false, moderation: false, notifications: false, audit: true, cache: false }),
  capabilityProviders: defineModuleCapabilityProviders({
    content: "content_entries + blocs typés (src/core/blocks)",
    localization: "content_entry_translations",
    media: "champs media + bloc image (MediaPicker)",
    seo: "content_entry_translations.seo + SEOHead/JsonLd",
    taxonomy: "",
    attributes: "content_types.fields (schéma dynamique JSONB)",
    search: "",
    publication: "content_entries.status/published_at",
    revisions: "content_entry_revisions + diff",
    locks: "", engagement: "", moderation: "", notifications: "",
    audit: "audit_log (CONTENT_*)",
    cache: "",
  }),
  presentations: defineModulePresentations({ card: ["public"], list: ["public", "admin"], single: ["public"], ui: ["admin"] }),
};
assertModuleCapabilityProviders(contentModule);
