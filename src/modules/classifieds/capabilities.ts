import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

export const classifiedsCapabilityProviders = {
  content: "classified_ads",
  localization: "classified_category_translations",
  media: "classified_ad_media",
  seo: "src/modules/classifieds/seo",
  taxonomy: "",
  attributes: "core/attributes",
  search: "classified_ads.search_vector",
  publication: "classifiedsWorkflow",
  revisions: "",
  locks: "",
  engagement: "classified_favorites",
  moderation: "classifieds.ad",
  notifications: "classifieds.notifications",
  audit: "classifieds.audit",
  cache: "",
} as PolywebModuleCapabilityProviders;
