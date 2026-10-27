/**
 * Mouvements de stock : le niveau d'un article dans un entrepôt est la somme signée de ses
 * mouvements (pas de compteur dénormalisé). Une sortie ne peut pas rendre le stock négatif.
 */
import { Effect } from "effect";
import { InsufficientStockError, InvalidMovementError } from "./errors";

export const MOVEMENT_KINDS = ["receipt", "issue", "adjustment", "transfer_in", "transfer_out", "shipment", "return"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];
/** Mouvements saisis à la main dans l'admin (les autres sont produits par les expéditions / transferts). */
export const MANUAL_MOVEMENT_KINDS = ["receipt", "issue", "adjustment"] as const satisfies readonly MovementKind[];

/**
 * Origine d'un mouvement dans le grand livre de stock (traçabilité) : saisie manuelle, transfert,
 * expédition, inventaire, et mouvements produits par d'autres modules via `logisticsStockPort`
 * (réception d'achat, vente boutique, retour client).
 */
export const MOVEMENT_SOURCES = ["manual", "transfer", "shipment", "inventory", "purchase", "order", "return"] as const;
export type MovementSource = (typeof MOVEMENT_SOURCES)[number];

/** Statuts d'une réservation de stock (tunnel de vente). */
export const RESERVATION_STATUSES = ["active", "consumed", "released"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

const OUTBOUND: readonly MovementKind[] = ["issue", "transfer_out", "shipment"];
const INBOUND: readonly MovementKind[] = ["receipt", "transfer_in", "return"];

export const normalizeSku = (sku: string) => sku.trim().toUpperCase();

export const validateSku = (sku: string): Effect.Effect<string, InvalidMovementError> => {
  const value = normalizeSku(sku);
  return /^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(value) ? Effect.succeed(value) : Effect.fail(new InvalidMovementError({ field: "sku", value: sku }));
};

/**
 * Quantité signée enregistrée pour un mouvement : positive en entrée, négative en sortie ;
 * un ajustement porte déjà son signe (non nul).
 */
export const signedQuantity = (kind: string, quantity: number): Effect.Effect<{ kind: MovementKind; delta: number }, InvalidMovementError> => {
  if (!(MOVEMENT_KINDS as readonly string[]).includes(kind)) return Effect.fail(new InvalidMovementError({ field: "kind", value: kind }));
  const k = kind as MovementKind;
  if (!Number.isSafeInteger(quantity) || quantity === 0 || (k !== "adjustment" && quantity < 0)) return Effect.fail(new InvalidMovementError({ field: "quantity", value: String(quantity) }));
  if (OUTBOUND.includes(k)) return Effect.succeed({ kind: k, delta: -quantity });
  if (INBOUND.includes(k)) return Effect.succeed({ kind: k, delta: quantity });
  return Effect.succeed({ kind: k, delta: quantity });
};

export const stockLevel = (movements: readonly { delta: number }[]) => movements.reduce((sum, m) => sum + m.delta, 0);

/** Vérifie qu'un delta (négatif = sortie) ne rend pas le stock négatif. */
export const ensureAvailable = (sku: string, available: number, delta: number): Effect.Effect<number, InsufficientStockError> =>
  available + delta < 0 ? Effect.fail(new InsufficientStockError({ sku, available, requested: -delta })) : Effect.succeed(available + delta);

/** Agrège des lignes par SKU (quantités sommées) — une expédition sort une fois chaque article. */
export const aggregateBySku = (lines: readonly { sku: string; quantity: number }[]): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(normalizeSku(line.sku), (totals.get(normalizeSku(line.sku)) ?? 0) + line.quantity);
  return totals;
};
