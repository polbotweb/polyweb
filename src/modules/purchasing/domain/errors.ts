import { Data } from "effect";

export class InvalidSupplierError extends Data.TaggedError("InvalidSupplierError")<{ readonly field: string; readonly value: string }> {
  override get message() {
    return `Fournisseur invalide (${this.field}) : ${this.value}`;
  }
}

export class InvalidPurchaseOrderError extends Data.TaggedError("InvalidPurchaseOrderError")<{ readonly field: string; readonly value: string }> {
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

export class MatchBlockedError extends Data.TaggedError("MatchBlockedError")<{ readonly detail: string }> {
  override get message() {
    return this.detail;
  }
}

export class InvalidInvoiceError extends Data.TaggedError("InvalidInvoiceError")<{ readonly field: string; readonly value: string }> {
  override get message() {
    return `Facture fournisseur invalide (${this.field}) : ${this.value}`;
  }
}

export class InvalidReturnError extends Data.TaggedError("InvalidReturnError")<{ readonly field: string; readonly value: string }> {
  override get message() {
    return `Retour fournisseur invalide (${this.field}) : ${this.value}`;
  }
}
