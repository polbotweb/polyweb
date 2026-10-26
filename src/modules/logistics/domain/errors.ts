import { Data } from "effect";

export class InvalidWarehouseError extends Data.TaggedError("InvalidWarehouseError")<{ readonly field: "code" | "name" | "country"; readonly value: string }> {
  override get message() {
    return `Entrepôt invalide (${this.field}) : ${this.value}`;
  }
}

export class InvalidShipmentError extends Data.TaggedError("InvalidShipmentError")<{ readonly field: "recipient" | "country" | "lines" | "quantity" | "sku" | "weight" | "tracking"; readonly value: string }> {
  override get message() {
    return `Expédition invalide (${this.field}) : ${this.value}`;
  }
}

export class InvalidMovementError extends Data.TaggedError("InvalidMovementError")<{ readonly field: "kind" | "quantity" | "sku" | "warehouse"; readonly value: string }> {
  override get message() {
    return `Mouvement de stock invalide (${this.field}) : ${this.value}`;
  }
}

/** Stock disponible insuffisant pour une sortie (expédition, sortie manuelle, transfert). */
export class InsufficientStockError extends Data.TaggedError("InsufficientStockError")<{ readonly sku: string; readonly available: number; readonly requested: number }> {
  override get message() {
    return `Stock insuffisant pour ${this.sku} : ${this.available} disponible(s), ${this.requested} demandé(s)`;
  }
}
