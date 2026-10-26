/**
 * Règles pures des opportunités : validation montant / probabilité / raison de perte,
 * probabilité effective selon l'étape (WON = 100, LOST = 0 quoi qu'il arrive), prévision
 * pondérée du pipeline par devise (montants en unités mineures, core/money).
 */
import { Effect } from "effect";
import { isCurrencyCode } from "@/core/money";
import { InvalidOpportunityError } from "./errors";
import { CRM_STAGES, type CrmStage, DEFAULT_STAGE_PROBABILITY, LOST_REASONS, type LostReason, OPEN_STAGES } from "./workflow";

export interface OpportunityFigures {
  readonly stage: CrmStage;
  readonly amountMinor: number;
  readonly currency: string;
  /** Probabilité saisie (0–100) ; null → défaut de l'étape. */
  readonly probability: number | null;
}

export const validateOpportunityFigures = (input: { amountMinor: number; currency: string; probability: number | null }) =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) {
      return yield* new InvalidOpportunityError({ field: "amount", value: String(input.amountMinor) });
    }
    if (!isCurrencyCode(input.currency)) return yield* new InvalidOpportunityError({ field: "currency", value: input.currency });
    if (input.probability !== null && (!Number.isInteger(input.probability) || input.probability < 0 || input.probability > 100)) {
      return yield* new InvalidOpportunityError({ field: "probability", value: String(input.probability) });
    }
    return input;
  });

/** Passage à LOST : une raison connue est obligatoire. */
export const validateLostReason = (stage: CrmStage, reason: string | null | undefined): Effect.Effect<LostReason | null, InvalidOpportunityError> => {
  if (stage !== "LOST") return Effect.succeed(null);
  return reason && (LOST_REASONS as readonly string[]).includes(reason)
    ? Effect.succeed(reason as LostReason)
    : Effect.fail(new InvalidOpportunityError({ field: "lostReason", value: String(reason ?? "") }));
};

export const effectiveProbability = (o: Pick<OpportunityFigures, "stage" | "probability">): number => {
  if (o.stage === "WON") return 100;
  if (o.stage === "LOST") return 0;
  return o.probability ?? DEFAULT_STAGE_PROBABILITY[o.stage];
};

/** Montant pondéré (arrondi à l'unité mineure, demi vers le haut). */
export const weightedAmountMinor = (o: OpportunityFigures): number => Math.round((o.amountMinor * effectiveProbability(o)) / 100);

export interface StageSummary {
  readonly stage: CrmStage;
  readonly count: number;
  readonly amountMinor: number;
  readonly weightedMinor: number;
}

export interface PipelineSummary {
  readonly currency: string;
  readonly stages: readonly StageSummary[];
  /** Ouvert : somme brute et prévision pondérée des étapes ouvertes. */
  readonly openAmountMinor: number;
  readonly forecastMinor: number;
  readonly wonAmountMinor: number;
  /** Taux de gain (%) sur les opportunités closes, null si aucune close. */
  readonly winRate: number | null;
}

/** Synthèse par devise (on n'additionne jamais deux devises). */
export const summarizePipeline = (items: readonly OpportunityFigures[]): readonly PipelineSummary[] => {
  const currencies = [...new Set(items.map((i) => i.currency))].sort();
  return currencies.map((currency) => {
    const inCurrency = items.filter((i) => i.currency === currency);
    const stages = CRM_STAGES.map((stage) => {
      const at = inCurrency.filter((i) => i.stage === stage);
      return {
        stage,
        count: at.length,
        amountMinor: at.reduce((s, i) => s + i.amountMinor, 0),
        weightedMinor: at.reduce((s, i) => s + weightedAmountMinor(i), 0),
      };
    });
    const open = stages.filter((s) => OPEN_STAGES.includes(s.stage));
    const won = stages.find((s) => s.stage === "WON")!;
    const lost = stages.find((s) => s.stage === "LOST")!;
    const closed = won.count + lost.count;
    return {
      currency,
      stages,
      openAmountMinor: open.reduce((s, x) => s + x.amountMinor, 0),
      forecastMinor: open.reduce((s, x) => s + x.weightedMinor, 0),
      wonAmountMinor: won.amountMinor,
      winRate: closed === 0 ? null : Math.round((won.count / closed) * 100),
    };
  });
};
