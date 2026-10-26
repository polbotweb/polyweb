/** Erreurs typées de core/money (Effect `Data.TaggedError`). */
import { Data } from 'effect';

/** Opération entre deux montants de devises différentes. */
export class CurrencyMismatchError extends Data.TaggedError('CurrencyMismatchError')<{
  readonly left: string;
  readonly right: string;
}> {
  override get message() {
    return `Devises incompatibles : ${this.left} / ${this.right}`;
  }
}

/** Code devise non ISO 4217 (ou non géré). */
export class UnknownCurrencyError extends Data.TaggedError('UnknownCurrencyError')<{ readonly currency: string }> {
  override get message() {
    return `Devise inconnue : ${this.currency}`;
  }
}

/** Montant ou taux invalide (format décimal, décimales en trop, dépassement d'entier sûr…). */
export class InvalidAmountError extends Data.TaggedError('InvalidAmountError')<{
  readonly input: string;
  readonly reason: 'format' | 'precision' | 'overflow' | 'ratios';
}> {
  override get message() {
    return `Montant invalide (${this.reason}) : ${this.input}`;
  }
}

export type MoneyError = CurrencyMismatchError | UnknownCurrencyError | InvalidAmountError;
