/**
 * Retours fournisseur et contrôle qualité. Les quantités retournées ne peuvent pas
 * dépasser la quantité reçue (diminuée des retours déjà faits).
 */
import { Effect } from "effect";
import { InvalidReturnError } from "./errors";

export const SUPPLIER_RETURN_STATUSES = ["DRAFT", "AUTHORIZED", "SHIPPED", "RECEIVED_BY_SUPPLIER", "CREDITED", "CANCELLED"] as const;
export type SupplierReturnStatus = (typeof SUPPLIER_RETURN_STATUSES)[number];

export const QUALITY_RESULTS = ["pending", "passed", "failed", "partial"] as const;
export type QualityResult = (typeof QUALITY_RESULTS)[number];

export const RETURN_REASONS = ["defective", "incorrect", "damaged", "quality", "other"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const returnWorkflow = {
  DRAFT: ["AUTHORIZED", "CANCELLED"],
  AUTHORIZED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["RECEIVED_BY_SUPPLIER"],
  RECEIVED_BY_SUPPLIER: ["CREDITED"],
  CREDITED: [],
  CANCELLED: [],
} as const satisfies Record<SupplierReturnStatus, readonly SupplierReturnStatus[]>;

export const canTransitionReturn = (from: SupplierReturnStatus, to: SupplierReturnStatus) =>
  (returnWorkflow[from] as readonly string[]).includes(to);

/** Le stock sort à l'expédition du retour, et uniquement pour les lignes stock. */
export const returnAffectsStock = (from: SupplierReturnStatus, to: SupplierReturnStatus) => from === "AUTHORIZED" && to === "SHIPPED";

export interface ReturnLinePlan {
  readonly receiptLineId: string;
  readonly itemId: string | null;
  readonly sku: string;
  readonly quantity: number;
  readonly receivedQuantity: number;
  readonly alreadyReturned: number;
  readonly kind: "stock" | "service";
}

export const planSupplierReturn = (lines: readonly ReturnLinePlan[]) =>
  Effect.gen(function* () {
    if (lines.length === 0) return yield* new InvalidReturnError({ field: "lines", value: "0" });
    const planned = [];
    for (const line of lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
        return yield* new InvalidReturnError({ field: "quantity", value: String(line.quantity) });
      }
      const remaining = line.receivedQuantity - line.alreadyReturned;
      if (line.quantity > remaining) {
        return yield* new InvalidReturnError({ field: "quantity", value: `${line.sku}:${line.quantity}/${remaining}` });
      }
      planned.push(line);
    }
    return planned;
  });

export const qualityResultOf = (accepted: number, rejected: number, received: number): QualityResult => {
  if (accepted + rejected <= 0) return "pending";
  if (rejected === 0 && accepted >= received) return "passed";
  if (accepted === 0 && rejected > 0) return "failed";
  return "partial";
};
