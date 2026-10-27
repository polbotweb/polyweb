/**
 * Erreurs typées de core/payments. Aucune ne transporte de secret : les causes
 * fournisseur sont réduites à un message (jamais la clé, jamais l'en-tête signé).
 */
import { Data } from 'effect';

/** Paiements désactivés, fournisseur inconnu ou clés absentes de l'environnement. */
export class PaymentsUnavailableError extends Data.TaggedError('PaymentsUnavailableError')<{ readonly reason: string }> {
  override get message() {
    return `Paiement en ligne indisponible : ${this.reason}`;
  }
}

/** Appel fournisseur en échec (réseau, refus, délai dépassé). */
export class PaymentProviderError extends Data.TaggedError('PaymentProviderError')<{
  readonly provider: string;
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message() {
    return `Fournisseur de paiement ${this.provider} : échec de ${this.operation}`;
  }
}

/** Corps de webhook non signé, signature invalide, expirée ou charge illisible. */
export class WebhookSignatureError extends Data.TaggedError('WebhookSignatureError')<{ readonly reason: string }> {
  override get message() {
    return `Webhook de paiement refusé : ${this.reason}`;
  }
}

/** Montant ou devise reçus ≠ paiement enregistré (fraude ou anomalie fournisseur). */
export class PaymentAmountMismatchError extends Data.TaggedError('PaymentAmountMismatchError')<{
  readonly expected: number;
  readonly received: number;
  readonly currency: string;
}> {
  override get message() {
    return `Montant incohérent : attendu ${this.expected} ${this.currency}, reçu ${this.received}.`;
  }
}

/** Montant non représentable chez le fournisseur (devise non gérée, précision). */
export class UnsupportedAmountError extends Data.TaggedError('UnsupportedAmountError')<{
  readonly currency: string;
  readonly amountMinor: number;
  readonly reason: 'currency' | 'precision' | 'non-positive';
}> {
  override get message() {
    return `Montant non pris en charge (${this.reason}) : ${this.amountMinor} ${this.currency}`;
  }
}

/** Référence de paiement mal formée ou objet (`purpose`) sans gestionnaire enregistré. */
export class UnknownPaymentPurposeError extends Data.TaggedError('UnknownPaymentPurposeError')<{ readonly reference: string }> {
  override get message() {
    return `Objet de paiement inconnu : ${this.reference}`;
  }
}
