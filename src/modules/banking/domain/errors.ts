/** Erreurs typées du domaine banking (pures, sans dépendance serveur). */
import { Data } from "effect";

/** Fichier de relevé illisible, trop gros, format refusé ou contenu incohérent. */
export class StatementParseError extends Data.TaggedError("StatementParseError")<{
  readonly format: string;
  readonly reason: "empty" | "format" | "too_large" | "too_many_lines" | "encoding" | "amount" | "date" | "currency" | "structure" | "forbidden_format" | "unsafe";
  readonly detail: string;
}> {
  override get message() {
    return `Relevé ${this.format} invalide (${this.reason}) : ${this.detail}`;
  }
}

/** Réglage banking invalide (champ + valeur refusée). */
export class InvalidBankingSettingsError extends Data.TaggedError("InvalidBankingSettingsError")<{ readonly field: string; readonly value: string }> {
  override get message() {
    return `Réglage bancaire invalide (${this.field}) : ${this.value}`;
  }
}

/** Règle de rapprochement invalide. */
export class InvalidBankRuleError extends Data.TaggedError("InvalidBankRuleError")<{ readonly field: string; readonly value: string }> {
  override get message() {
    return `Règle de rapprochement invalide (${this.field}) : ${this.value}`;
  }
}

/** Rapprochement déséquilibré : affectations + ajustements ≠ montant du mouvement. */
export class UnbalancedReconciliationError extends Data.TaggedError("UnbalancedReconciliationError")<{ readonly expectedMinor: number; readonly actualMinor: number }> {
  override get message() {
    return `Rapprochement déséquilibré : ${this.actualMinor} affecté(s) pour ${this.expectedMinor} attendu(s).`;
  }
}

/** Période verrouillée (date de verrouillage ou FEC déjà généré). */
export class LockedPeriodError extends Data.TaggedError("LockedPeriodError")<{ readonly date: string; readonly lockDate: string }> {
  override get message() {
    return `La période est verrouillée jusqu'au ${this.lockDate} inclus (date demandée : ${this.date}).`;
  }
}

/** Profil CSV invalide. */
export class InvalidCsvProfileError extends Data.TaggedError("InvalidCsvProfileError")<{ readonly field: string; readonly value: string }> {
  override get message() {
    return `Profil CSV invalide (${this.field}) : ${this.value}`;
  }
}
