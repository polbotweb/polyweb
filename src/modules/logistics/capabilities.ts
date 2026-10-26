import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/** Une entrée par capacité ACTIVÉE dans `module.ts` (table ou workflow qui la porte). */
export const logisticsCapabilityProviders = {
  content: "logistics_shipments + logistics_warehouses / logistics_items / logistics_stock_movements",
  publication: "shipmentWorkflow (DRAFT → READY → SHIPPED → DELIVERED / RETURNED, CANCELLED)",
  revisions: "logistics_shipment_revisions",
  locks: "logistics_shipment_locks",
} as unknown as PolywebModuleCapabilityProviders;
