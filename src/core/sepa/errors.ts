/** Erreurs du générateur pain.001 (virement SEPA). */
import { Data } from "effect";

export class InvalidSepaPaymentError extends Data.TaggedError("InvalidSepaPaymentError")<{
  readonly field: string;
  readonly value: string;
}> {
  override get message() {
    return `Virement SEPA invalide (${this.field}) : ${this.value}`;
  }
}
