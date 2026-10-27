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

export class InvalidSellerProfileError extends Data.TaggedError("InvalidSellerProfileError")<{ readonly field: "legalName" | "country" | "vatNumber" | "legalId" | "legalIdScheme" | "email" | "iban" | "bic" | "postcode"; readonly value: string }> {
  override get message() {
    return `Profil vendeur invalide (${this.field}) : ${this.value}`;
  }
}

/** Factur-X non produit pour ce document (PDF simple servi à la place) : motif auditable. */
export class FacturXUnavailableError extends Data.TaggedError("FacturXUnavailableError")<{ readonly reason: "not-invoice" | "not-issued" | "no-seller-profile" | "unsupported-currency" | "totals-mismatch" | "invalid"; readonly detail?: string }> {
  override get message() {
    return `Factur-X indisponible (${this.reason})${this.detail ? ` : ${this.detail}` : ""}`;
  }
}
