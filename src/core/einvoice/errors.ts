import { Data } from "effect";

/** Règle EN 16931 non respectée (identifiant de règle `BR-…` et terme concerné). */
export class EInvoiceValidationError extends Data.TaggedError("EInvoiceValidationError")<{
  readonly rule: string;
  readonly detail: string;
}> {
  override get message() {
    return `EN 16931 ${this.rule}: ${this.detail}`;
  }
}

/** Échec d'assemblage du PDF/A-3 (PDF source illisible, chiffré…). */
export class FacturXEmbedError extends Data.TaggedError("FacturXEmbedError")<{
  readonly reason: "invalid-pdf" | "encrypted";
  readonly cause?: unknown;
}> {}
