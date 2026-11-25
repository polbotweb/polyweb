import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/** Une entrée par capacité ACTIVÉE dans `module.ts` (table ou service qui la porte). */
export const bankingCapabilityProviders = {
  content: "bank_accounts / bank_imports / bank_statements / bank_transactions / bank_reconciliations / bank_ledger_entries",
  notifications: "bankingNotifications (notifications/definitions.ts)",
  audit: "audit_log (banking.*) via services/audit.ts",
} as unknown as PolywebModuleCapabilityProviders;
