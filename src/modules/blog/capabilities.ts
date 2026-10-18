import type { AtomicModuleCapabilityProviders } from "@/core/modules/module-contract";
import { CMS_CAPABILITIES } from "@/core/capabilities";

const capabilityIds = [
  "content",
  "localization",
  "media",
  "seo",
  "taxonomy",
  "attributes",
  "search",
  "publication",
  "revisions",
  "locks",
  "engagement",
  "moderation",
  "notifications",
  "audit",
  "cache",
] as const;

export const blogCapabilityProviders = Object.fromEntries(
  capabilityIds.map((id) => [id, CMS_CAPABILITIES[id].implementations.join(" + ")]),
) as unknown as AtomicModuleCapabilityProviders;
