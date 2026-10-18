import type { AtomicModuleCapabilityProviders } from "@/core/modules/module-contract";
import { CMS_CAPABILITIES } from "@/core/capabilities";

const ids = [
  "content", "localization", "media", "seo", "taxonomy", "attributes", "search", "publication", "revisions",
  "locks", "engagement", "moderation", "notifications", "audit", "cache",
] as const;

export const servicesCapabilityProviders = Object.fromEntries(
  ids.map((id) => [id, CMS_CAPABILITIES[id].implementations.join(" + ")]),
) as unknown as AtomicModuleCapabilityProviders;
