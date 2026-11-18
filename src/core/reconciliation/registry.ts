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
  readonly letteringCode: string | null;
  readonly actorId: string | null;
}

export interface AllocationResult {
  /** Règlement créé par la source (sales_payments / purchasing_payments…), pour l'annulation. */
  readonly paymentId: string | null;
  /** La pièce est-elle soldée après imputation (lettrage complet) ? */
  readonly settled: boolean;
  readonly documentNumber: string;
}

export interface ReconciliationSource {
  readonly key: string;
  readonly direction: ReconDirection;
  readonly findCandidates: (query: CandidateQuery) => Effect.Effect<readonly ReconCandidate[], DbError>;
  readonly apply: (tx: DbTransaction, input: AllocationInput) => Effect.Effect<AllocationResult, DbError | ActionFailure>;
  /** Annule l'imputation (contrepassation du règlement), jamais de suppression. */
  readonly reverse: (tx: DbTransaction, input: { readonly paymentId: string; readonly candidateId: string; readonly reconciliationId: string; readonly actorId: string | null; readonly date: string }) => Effect.Effect<void, DbError | ActionFailure>;
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
