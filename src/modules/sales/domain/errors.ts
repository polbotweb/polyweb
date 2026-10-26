import { Data } from "effect";

export class InvalidSalesLineError extends Data.TaggedError("InvalidSalesLineError")<{ readonly index: number; readonly field: "quantity" | "unitPrice" | "discountPercent" | "description" | "taxCategory"; readonly value: string }> {
  override get message() {
    return `Ligne ${this.index + 1} invalide (${this.field}) : ${this.value}`;
  }
}

export class EmptySalesDocumentError extends Data.TaggedError("EmptySalesDocumentError")<{ readonly kind: string }> {
  override get message() {
    return `Document sans ligne (${this.kind}).`;
  }
}

export class CreditExceedsInvoiceError extends Data.TaggedError("CreditExceedsInvoiceError")<{ readonly invoiceGrossMinor: number; readonly alreadyCreditedMinor: number; readonly requestedMinor: number }> {
  override get message() {
    return `Avoir supérieur au restant créditable (${this.invoiceGrossMinor - this.alreadyCreditedMinor} < ${this.requestedMinor}).`;
  }
}

export class InvalidPaymentError extends Data.TaggedError("InvalidPaymentError")<{ readonly reason: "non-positive" | "overpayment" | "currency" | "status"; readonly value: string }> {
  override get message() {
    return `Paiement invalide (${this.reason}) : ${this.value}`;
  }
}
