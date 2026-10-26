import { Data } from "effect";

export class InvalidSupplierError extends Data.TaggedError("InvalidSupplierError")<{ readonly field: "code" | "name" | "email" | "country" | "paymentTerms"; readonly value: string }> {
  override get message() {
    return `Fournisseur invalide (${this.field}) : ${this.value}`;
  }
}

export class InvalidPurchaseOrderError extends Data.TaggedError("InvalidPurchaseOrderError")<{ readonly field: "lines" | "sku" | "quantity" | "unitPrice" | "currency" | "expectedDate"; readonly value: string }> {
  override get message() {
    return `Commande fournisseur invalide (${this.field}) : ${this.value}`;
  }
}

/** Réception refusée : ligne inconnue, quantité nulle ou supérieure au reliquat commandé. */
export class InvalidReceiptError extends Data.TaggedError("InvalidReceiptError")<{ readonly field: "lines" | "line" | "quantity"; readonly value: string }> {
  override get message() {
    return `Réception invalide (${this.field}) : ${this.value}`;
  }
}
