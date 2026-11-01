/** Erreurs du core/fx (taux de change). */
import { Data } from 'effect';

/** Flux BCE illisible ou incomplet. */
export class EcbFeedError extends Data.TaggedError('EcbFeedError')<{ readonly reason: 'format' | 'date' | 'empty' | 'rate'; readonly detail?: string }> {
  override get message() { return `Flux BCE invalide (${this.reason})${this.detail ? ` : ${this.detail}` : ''}`; }
}

/** Taux nul, négatif ou mal formé. */
export class InvalidRateError extends Data.TaggedError('InvalidRateError')<{ readonly input: string }> {
  override get message() { return `Taux de change invalide : ${this.input}`; }
}

/** Aucun taux disponible pour la paire à la date demandée. */
export class RateNotFoundError extends Data.TaggedError('RateNotFoundError')<{ readonly from: string; readonly to: string; readonly date: string }> {
  override get message() { return `Aucun taux ${this.from}→${this.to} au ${this.date}`; }
}

/** Devise de tenue verrouillée (écritures déjà émises). */
export class BaseCurrencyLockedError extends Data.TaggedError('BaseCurrencyLockedError')<{ readonly baseCurrency: string }> {
  override get message() { return `Devise de tenue verrouillée (${this.baseCurrency})`; }
}

/** Récupération du flux BCE impossible (réseau, statut HTTP). */
export class EcbFetchError extends Data.TaggedError('EcbFetchError')<{ readonly status?: number; readonly cause?: unknown }> {
  override get message() { return `Flux BCE indisponible${this.status ? ` (HTTP ${this.status})` : ''}`; }
}
