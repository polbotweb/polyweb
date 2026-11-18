/**
 * Moteur d'approbation générique, réutilisable par tous les modules (achats d'abord).
 * Les politiques sont configurables par organisation, module et type de ressource.
 */
export const APPROVAL_MODES = ["none", "single_threshold", "bands"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const APPROVAL_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

export const APPROVAL_STEP_STATUSES = ["WAITING", "PENDING", "APPROVED", "REJECTED", "SKIPPED"] as const;
export type ApprovalStepStatus = (typeof APPROVAL_STEP_STATUSES)[number];

/** Rôles d'organisation pouvant être exigés sur un palier (plus le joker `any`). */
export const APPROVAL_ROLES = ["orgMember", "orgAdmin", "orgOwner", "admin", "any"] as const;
export type ApprovalRole = (typeof APPROVAL_ROLES)[number];

export interface ApprovalBand {
  readonly level: number;
  /** Inclusive, unités mineures. */
  readonly minMinor: number;
  /** Exclusive ; `null` = pas de plafond. */
  readonly maxMinor: number | null;
  readonly requiredRole: ApprovalRole;
  /** Permission optionnelle (ex. `purchasing:approve`). */
  readonly requiredPermission: string | null;
}

export interface ApprovalPolicy {
  readonly mode: ApprovalMode;
  /** Seuil unique (mode `single_threshold`) : en dessous, pas d'approbation. */
  readonly thresholdMinor: number;
  readonly currency: string;
  readonly bands: readonly ApprovalBand[];
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  mode: "none",
  thresholdMinor: 0,
  currency: "EUR",
  bands: [],
};

export interface ApprovalActor {
  readonly userId: string;
  /** `admin` = administrateur plateforme. */
  readonly isPlatformAdmin: boolean;
  /** Rôle dans l'organisation du document, ou null. */
  readonly organizationRole: "orgMember" | "orgAdmin" | "orgOwner" | null;
  readonly permissions: readonly string[];
}

export const roleRank: Record<"orgMember" | "orgAdmin" | "orgOwner" | "admin", number> = {
  orgMember: 1,
  orgAdmin: 2,
  orgOwner: 3,
  admin: 4,
};
