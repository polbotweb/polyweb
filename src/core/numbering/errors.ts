/** Erreurs typées de core/numbering (Effect `Data.TaggedError`). */
import { Data } from 'effect';

/** Motif de numérotation invalide (jeton inconnu, absence de `{seq}`, largeur hors bornes). */
export class InvalidNumberingPatternError extends Data.TaggedError('InvalidNumberingPatternError')<{ readonly pattern: string; readonly reason: string }> {
  override get message() {
    return `Motif de numérotation invalide « ${this.pattern} » : ${this.reason}`;
  }
}

/** Date invalide pour calculer la période ou le numéro. */
export class InvalidNumberingDateError extends Data.TaggedError('InvalidNumberingDateError')<{ readonly date: string }> {
  override get message() {
    return `Date de numérotation invalide : ${this.date}`;
  }
}
