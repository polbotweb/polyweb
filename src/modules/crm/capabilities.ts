import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/** Une entrée par capacité ACTIVÉE dans `module.ts` (table ou workflow qui la porte). */
export const crmCapabilityProviders = {
  content: "crm_opportunities + crm_companies / crm_contacts / crm_activities",
  publication: "crmWorkflow (pipeline NEW → QUALIFIED → PROPOSAL → NEGOTIATION → WON / LOST)",
  revisions: "crm_opportunity_revisions",
  locks: "crm_opportunity_locks",
} as unknown as PolywebModuleCapabilityProviders;
