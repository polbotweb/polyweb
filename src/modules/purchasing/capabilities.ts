import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/** Une entrée par capacité ACTIVÉE dans `module.ts` (table ou workflow qui la porte). */
export const purchasingCapabilityProviders = {
  content: "purchasing_orders + purchasing_suppliers / purchasing_order_lines / purchasing_receipts",
  publication: "purchaseOrderWorkflow (DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED → CLOSED, CANCELLED)",
  revisions: "purchasing_order_revisions",
  locks: "purchasing_order_locks",
} as unknown as PolywebModuleCapabilityProviders;
