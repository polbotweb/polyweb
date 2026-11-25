/**
 * Registre des sources de rapprochement : chaque module propriétaire d'un type de pièce déclare
 * comment trouver ses pièces ouvertes et comment imputer / annuler un règlement, DANS la transaction
 * du rapprochement (l'effet métier, l'écriture comptable et l'audit sont validés ou annulés ensemble).
 */
import type { Effect } from "effect";
import type { DbError } from "@/lib/effect/errors";
import type { ActionFailure } from "@/lib/effect/failure";
import type { DbTransaction } from "@/lib/effect/transaction";
import type { ReconCandidate, ReconDirection, ReconLine } from "./types";

export interface CandidateQuery {
  readonly organizationId: string | null;
  readonly line: ReconLine;
  /** Fenêtre de dates (jours) autour du mouvement, pour borner la lecture. */
  readonly windowDays: number;
  /** Identifiants explicitement demandés (recherche manuelle), sinon heuristique de la source. */
  readonly ids?: readonly string[];
  /** Recherche libre (numéro, tiers) pour l'écran manuel. */
  readonly search?: string;
  readonly limit: number;
}

export interface AllocationInput {
  readonly organizationId: string | null;
  readonly candidateId: string;
  /** Montant imputé (> 0, devise de la pièce). */
  readonly amountMinor: number;
  readonly currency: string;
  readonly paidAt: string;
  readonly bankAccountId: string;
  readonly reference: string;
  readonly reconciliationId: string;
  /**
   * Code de lettrage du rapprochement, attribué à la première demande (une seule fois par
   * rapprochement) : une source ne le réclame que si la pièce est soldée, si bien que la séquence
   * sans trou n'est consommée que par un lettrage réel. `null` si le lettrage est désactivé.
   */
  readonly lettering: () => Effect.Effect<string | null, DbError>;
  /** Contre-valeur EUR de l'imputation (devise de tenue), calculée par l'appelant. */
  readonly baseAmountMinor: number | null;
  /** Motif de retour ISO (R-transaction) porté par la ligne de relevé, le cas échéant. */
  readonly returnReason?: string | null;
  readonly actorId: string | null;
}

export interface AllocationResult {
  /** Règlement créé par la source (sales_payments / purchasing_payments…), pour l'annulation. */
  readonly paymentId: string | null;
  /** La pièce est-elle soldée après imputation (lettrage complet) ? */
  readonly settled: boolean;
  readonly documentNumber: string;
  /** Effets écrits (table + id), conservés pour la contrepassation et l'audit. */
  readonly effects: readonly { readonly table: string; readonly id: string }[];
  /** Compte tiers (auxiliaire FEC) de la pièce, pour l'écriture d'écart (avance, trop-perçu). */
  readonly aux: { readonly account: string; readonly label: string } | null;
}

export interface ReconciliationSource {
  readonly key: string;
  readonly direction: ReconDirection;
  /**
   * La source passe elle-même toute l'écriture côté banque (virement interne, versement d'un
   * prestataire) : l'appelant ne calcule ni écart de change ni règlement pour cette imputation.
   */
  readonly postsBank?: boolean;
  readonly findCandidates: (query: CandidateQuery) => Effect.Effect<readonly ReconCandidate[], DbError>;
  readonly apply: (tx: DbTransaction, input: AllocationInput) => Effect.Effect<AllocationResult, DbError | ActionFailure>;
  /** Annule l'imputation (contrepassation du règlement), jamais de suppression. */
  readonly reverse: (tx: DbTransaction, input: { readonly effects: readonly { readonly table: string; readonly id: string }[]; readonly candidateId: string; readonly reconciliationId: string; readonly actorId: string | null; readonly date: string }) => Effect.Effect<void, DbError | ActionFailure>;
}

const SOURCE_KEY = /^[a-z][a-z0-9-]{1,39}$/;
const registry = new Map<string, ReconciliationSource>();

/** Enregistre (ou remplace, rechargement à chaud) une source. */
export const registerReconciliationSource = (source: ReconciliationSource): void => {
  if (!SOURCE_KEY.test(source.key)) throw new Error(`Source de rapprochement invalide : ${source.key}`);
  registry.set(source.key, source);
};

export const reconciliationSource = (key: string): ReconciliationSource | undefined => registry.get(key);

export const reconciliationSources = (): readonly ReconciliationSource[] => [...registry.values()].sort((a, b) => a.key.localeCompare(b.key));

export const clearReconciliationSourcesForTests = (): void => registry.clear();
