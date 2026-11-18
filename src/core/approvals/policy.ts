/**
 * Règles pures d'approbation : quels paliers s'appliquent à un montant, qui peut décider,
 * et quel statut résulte d'une décision. Aucun I/O.
 */
import { Effect } from "effect";
import { InvalidApprovalPolicyError, ApprovalDecisionError } from "./errors";
import {
  APPROVAL_MODES,
  APPROVAL_ROLES,
  DEFAULT_APPROVAL_POLICY,
  roleRank,
  type ApprovalActor,
  type ApprovalBand,
  type ApprovalMode,
  type ApprovalPolicy,
  type ApprovalRole,
  type ApprovalStepStatus,
} from "./types";

const isRole = (value: string): value is ApprovalRole => (APPROVAL_ROLES as readonly string[]).includes(value);
const isMode = (value: string): value is ApprovalMode => (APPROVAL_MODES as readonly string[]).includes(value);

/** Un palier s'applique si `min <= amount < max` (max null = infini). */
export const bandApplies = (band: ApprovalBand, amountMinor: number) =>
  amountMinor >= band.minMinor && (band.maxMinor === null || amountMinor < band.maxMinor);

/**
 * Paliers requis pour un montant, triés par niveau croissant.
 * - `none` : aucun.
 * - `single_threshold` : un palier unique au-delà du seuil (rôle orgAdmin par défaut).
 * - `bands` : tous les paliers dont la fourchette couvre le montant (chaîne).
 */
export const requiredBands = (policy: ApprovalPolicy, amountMinor: number): readonly ApprovalBand[] => {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return [];
  if (policy.mode === "none") return [];
  if (policy.mode === "single_threshold") {
    if (amountMinor < policy.thresholdMinor) return [];
    const override = policy.bands[0];
    return [{
      level: override?.level ?? 1,
      minMinor: policy.thresholdMinor,
      maxMinor: null,
      requiredRole: override?.requiredRole ?? "orgAdmin",
      requiredPermission: override?.requiredPermission ?? null,
    }];
  }
  // Chaîne : un palier s'applique dès que le montant atteint son min, tant que le max (s'il est posé) n'est pas dépassé.
  // Pour une chaîne typique, laisser max = null sur les paliers inférieurs.
  return [...policy.bands].filter((band) => bandApplies(band, amountMinor)).sort((a, b) => a.level - b.level);
};

export const approvalRequired = (policy: ApprovalPolicy, amountMinor: number) => requiredBands(policy, amountMinor).length > 0;

/** L'acteur satisfait-il le palier (rôle hiérarchique inclus : orgOwner couvre orgAdmin, etc.) ? */
export const actorSatisfies = (actor: ApprovalActor, band: Pick<ApprovalBand, "requiredRole" | "requiredPermission">): boolean => {
  if (band.requiredPermission && !actor.permissions.includes(band.requiredPermission) && !actor.isPlatformAdmin) {
    return false;
  }
  if (band.requiredRole === "any") return true;
  if (band.requiredRole === "admin") return actor.isPlatformAdmin;
  if (actor.isPlatformAdmin) return true;
  if (!actor.organizationRole) return false;
  return roleRank[actor.organizationRole] >= roleRank[band.requiredRole];
};

export const validatePolicy = (input: ApprovalPolicy): Effect.Effect<ApprovalPolicy, InvalidApprovalPolicyError> => {
  if (!isMode(input.mode)) return Effect.fail(new InvalidApprovalPolicyError({ field: "mode", value: input.mode }));
  if (!Number.isSafeInteger(input.thresholdMinor) || input.thresholdMinor < 0) {
    return Effect.fail(new InvalidApprovalPolicyError({ field: "thresholdMinor", value: String(input.thresholdMinor) }));
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) return Effect.fail(new InvalidApprovalPolicyError({ field: "currency", value: input.currency }));
  if (input.mode === "bands" && input.bands.length === 0) {
    return Effect.fail(new InvalidApprovalPolicyError({ field: "bands", value: "0" }));
  }
  if (input.bands.length === 0) return Effect.succeed({ ...input, bands: [] });
  const seen = new Set<number>();
  const bands: ApprovalBand[] = [];
  for (const band of input.bands) {
    if (!Number.isSafeInteger(band.level) || band.level < 1 || band.level > 20 || seen.has(band.level)) {
      return Effect.fail(new InvalidApprovalPolicyError({ field: "level", value: String(band.level) }));
    }
    if (!Number.isSafeInteger(band.minMinor) || band.minMinor < 0) {
      return Effect.fail(new InvalidApprovalPolicyError({ field: "minMinor", value: String(band.minMinor) }));
    }
    if (band.maxMinor !== null && (!Number.isSafeInteger(band.maxMinor) || band.maxMinor <= band.minMinor)) {
      return Effect.fail(new InvalidApprovalPolicyError({ field: "maxMinor", value: String(band.maxMinor) }));
    }
    if (!isRole(band.requiredRole)) return Effect.fail(new InvalidApprovalPolicyError({ field: "requiredRole", value: band.requiredRole }));
    seen.add(band.level);
    bands.push(band);
  }
  return Effect.succeed({ ...input, bands: bands.sort((a, b) => a.level - b.level || a.minMinor - b.minMinor) });
};

export interface StepState {
  readonly level: number;
  readonly status: ApprovalStepStatus;
  readonly requiredRole: ApprovalRole;
  readonly requiredPermission: string | null;
}

/** Prochain palier à décider (le premier encore PENDING). */
export const currentStep = (steps: readonly StepState[]) => steps.find((step) => step.status === "PENDING") ?? null;

export const requestStatusFromSteps = (steps: readonly StepState[]): "PENDING" | "APPROVED" | "REJECTED" => {
  if (steps.some((step) => step.status === "REJECTED")) return "REJECTED";
  if (steps.length > 0 && steps.every((step) => step.status === "APPROVED" || step.status === "SKIPPED")) return "APPROVED";
  return "PENDING";
};

/** Applique une décision sur le palier courant. */
export const applyDecision = (
  steps: readonly StepState[],
  actor: ApprovalActor,
  decision: "APPROVED" | "REJECTED",
): Effect.Effect<{ steps: StepState[]; status: "PENDING" | "APPROVED" | "REJECTED" }, ApprovalDecisionError> => {
  const pending = currentStep(steps);
  if (!pending) return Effect.fail(new ApprovalDecisionError({ reason: "status", value: requestStatusFromSteps(steps) }));
  if (!actorSatisfies(actor, pending)) {
    return Effect.fail(new ApprovalDecisionError({ reason: "role", value: pending.requiredRole }));
  }
  let next: StepState[] = steps.map((step) => {
    if (step.level !== pending.level) {
      if (decision === "REJECTED" && step.status === "WAITING") return { ...step, status: "SKIPPED" as const };
      return step;
    }
    return { ...step, status: decision };
  });
  if (decision === "APPROVED") {
    const following = next.find((step) => step.status === "WAITING");
    if (following) next = next.map((step) => (step.level === following.level ? { ...step, status: "PENDING" as const } : step));
  }
  return Effect.succeed({ steps: next, status: requestStatusFromSteps(next) });
};

export { DEFAULT_APPROVAL_POLICY };
