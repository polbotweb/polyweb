/**
 * Calcul du réassort : quantité suggérée à partir du stock, des commandes ouvertes
 * et des règles min/max (par article et entrepôt). Pur.
 */
import { Effect } from "effect";
import { InvalidPurchaseOrderError } from "./errors";
import type { ReorderMode } from "./settings";

export interface ReorderRuleInput {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly minQty: number;
  readonly maxQty: number;
  readonly packQty: number;
  readonly preferredSupplierId: string | null;
}

export interface ReorderPosition {
  readonly onHand: number;
  /** Quantité déjà commandée (BC envoyé ou partiellement reçu, reliquat). */
  readonly outstanding: number;
  /** Réservations actives, si le réglage les inclut. */
  readonly reserved: number;
}

export interface ReorderSuggestion {
  readonly itemId: string;
  readonly warehouseId: string;
  readonly supplierId: string | null;
  readonly onHand: number;
  readonly outstanding: number;
  readonly reserved: number;
  readonly available: number;
  readonly suggestedQty: number;
}

export const validateReorderRule = (input: ReorderRuleInput) =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(input.minQty) || input.minQty < 0) return yield* new InvalidPurchaseOrderError({ field: "minQty", value: String(input.minQty) });
    if (!Number.isSafeInteger(input.maxQty) || input.maxQty < input.minQty) return yield* new InvalidPurchaseOrderError({ field: "maxQty", value: String(input.maxQty) });
    if (!Number.isSafeInteger(input.packQty) || input.packQty < 1) return yield* new InvalidPurchaseOrderError({ field: "packQty", value: String(input.packQty) });
    return input;
  });

/** Arrondit au multiple d'emballage supérieur (au moins 1 multiple si une suggestion est due). */
export const ceilToPack = (qty: number, packQty: number) => {
  if (qty <= 0) return 0;
  const pack = Math.max(1, packQty);
  return Math.ceil(qty / pack) * pack;
};

/**
 * Disponible = physique + reliquat commandé − réservations (si incluses).
 * Suggestion si disponible ≤ min, pour remonter au max.
 */
export const suggestReorder = (rule: ReorderRuleInput, position: ReorderPosition, includeReservations: boolean): ReorderSuggestion | null => {
  const reserved = includeReservations ? Math.max(0, position.reserved) : 0;
  const available = position.onHand + position.outstanding - reserved;
  if (available > rule.minQty) return null;
  const raw = rule.maxQty - available;
  const suggestedQty = ceilToPack(raw, rule.packQty);
  if (suggestedQty <= 0) return null;
  return {
    itemId: rule.itemId,
    warehouseId: rule.warehouseId,
    supplierId: rule.preferredSupplierId,
    onHand: position.onHand,
    outstanding: position.outstanding,
    reserved,
    available,
    suggestedQty,
  };
};

export interface ReorderAction {
  readonly createDraft: boolean;
  readonly autoSend: boolean;
}

/** Décide de l'action à partir du mode, sans jamais envoyer si le fournisseur n'est pas autorisé. */
export const reorderAction = (mode: ReorderMode, autoSendTrustedOnly: boolean, supplierTrusted: boolean): ReorderAction => {
  if (mode === "off" || mode === "suggestions") return { createDraft: false, autoSend: false };
  if (mode === "auto_draft") return { createDraft: true, autoSend: false };
  return { createDraft: true, autoSend: mode === "auto_send" && (!autoSendTrustedOnly || supplierTrusted) };
};
