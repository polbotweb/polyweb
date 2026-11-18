/**
 * core/reconciliation — moteur générique de rapprochement d'un mouvement (bancaire, versement
 * d'un prestataire…) avec des pièces ouvertes fournies par des **sources** enregistrées par les
 * modules (factures clients, factures fournisseurs, lots SEPA, versements Stripe, virements internes).
 * Pur (aucun accès base) : scoring, combinaisons bornées, normalisation des références.
 */

/** Mouvement à rapprocher. `amountMinor` signé : > 0 encaissement (crédit), < 0 décaissement (débit). */
export interface ReconLine {
  readonly id: string;
  readonly amountMinor: number;
  readonly currency: string;
  /** Date comptable (AAAA-MM-JJ). */
  readonly bookingDate: string;
  readonly valueDate: string | null;
  readonly label: string;
  /** Références fortes portées par la banque : EndToEndId, référence structurée (RF…), référence client. */
  readonly references: readonly string[];
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
}

export type ReconDirection = "in" | "out";

/** Pièce ouverte candidate (montant attendu positif, dans la devise du mouvement). */
export interface ReconCandidate {
  /** Clé de la source (`sales-invoice`, `purchasing-invoice`, `purchasing-sepa`…). */
  readonly source: string;
  readonly id: string;
  readonly direction: ReconDirection;
  /** Restant attendu, en unités mineures de la devise du mouvement (> 0). */
  readonly openMinor: number;
  readonly currency: string;
  /** Montant d'origine si la pièce est dans une autre devise que le mouvement. */
  readonly originalMinor?: number;
  readonly originalCurrency?: string;
  /** Date de référence (échéance, à défaut émission / exécution demandée). */
  readonly date: string | null;
  /** Références fortes (numéro de pièce, EndToEndId, RF, référence de paiement). */
  readonly references: readonly string[];
  readonly counterpartyName: string | null;
  readonly counterpartyIbans: readonly string[];
  /** Regroupement pour les paiements groupés (même client / fournisseur). */
  readonly groupKey: string | null;
  /** Libellé lisible (affichage). */
  readonly label: string;
}

export interface MatchWeights {
  readonly reference: number;
  readonly amount: number;
  readonly iban: number;
  readonly name: number;
  readonly date: number;
}

export interface MatchSettings {
  readonly weights: MatchWeights;
  /** Fenêtre (jours) autour de la date de la pièce. */
  readonly dateWindowDays: number;
  /** Tolérance d'écart de montant : absolue (unités mineures) ET relative (%) — la plus grande s'applique. */
  readonly toleranceAbsoluteMinor: number;
  readonly tolerancePercent: number;
  /** Nombre maximal de pièces combinées pour un paiement groupé. */
  readonly maxCombination: number;
  /** Budget de temps de la recherche de combinaisons (ms). */
  readonly combinationTimeMs: number;
  /** Nombre maximal de propositions renvoyées. */
  readonly maxProposals: number;
}

export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  weights: { reference: 40, amount: 30, iban: 15, name: 10, date: 5 },
  dateWindowDays: 10,
  toleranceAbsoluteMinor: 100,
  tolerancePercent: 0.5,
  maxCombination: 8,
  combinationTimeMs: 200,
  maxProposals: 5,
};

export type MatchReason = "reference" | "amount_exact" | "amount_tolerance" | "iban" | "name" | "date" | "combination";

export interface Proposal {
  readonly candidates: readonly ReconCandidate[];
  /** Score 0..100 (entier). */
  readonly score: number;
  readonly reasons: readonly MatchReason[];
  /** Somme attendue des pièces (unités mineures, positive). */
  readonly expectedMinor: number;
  /** |mouvement| − attendu : > 0 trop-perçu / frais en moins, < 0 manque. */
  readonly deltaMinor: number;
  /** Toutes les références sont exactes et le montant est exact. */
  readonly exact: boolean;
}
