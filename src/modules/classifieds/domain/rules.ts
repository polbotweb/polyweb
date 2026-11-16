/**
 * Règles pures du domaine petites annonces : visibilité, cycle de vie, limites, slugs.
 */
import type { ModerationDecisionName } from "@/core/moderation/registry";
import type { ClassifiedLifecycle, ClassifiedVisibility, ModerationStatus } from "./workflow";
import { canTransition } from "./workflow";

export const NOT_FOUND_MESSAGE = "Élément introuvable.";
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const BODY_MIN = 10;
export const BODY_MAX = 20_000;
export const CITY_MAX = 120;
export const POSTAL_MAX = 20;
export const ADS_PAGE_SIZE = 20;
export const MAX_IMAGES = 8;
export const MIN_IMAGES_OFFER = 1;
export const DURATION_MIN = 7;
export const DURATION_MAX = 90;
export const DEFAULT_DURATION_DAYS = 30;
export const DEFAULT_MAX_RENEWALS = 3;
export const ATTRIBUTE_RESOURCE = "classifieds.ad";
export const ATTRIBUTE_OWNER = "category";

export const CLASSIFIED_RATE_LIMITS = {
  create: { window: 600, max: 5 },
  update: { window: 600, max: 20 },
  renew: { window: 3600, max: 10 },
  contact: { window: 3600, max: 5 },
  contactAd: { window: 86400, max: 2 },
  favorite: { window: 60, max: 30 },
  savedSearch: { window: 60, max: 20 },
  admin: { window: 60, max: 60 },
} as const;
export type ClassifiedRateLimitKind = keyof typeof CLASSIFIED_RATE_LIMITS;

export interface BoardAccessInput {
  readonly visibility: ClassifiedVisibility;
  readonly signedIn: boolean;
  readonly orgMember: boolean;
  readonly manager: boolean;
}

/** Un tableau est-il visible ? Les gestionnaires voient toujours le tableau. */
export function canViewBoard(input: BoardAccessInput): boolean {
  if (input.manager) return true;
  if (input.visibility === "public") return true;
  if (!input.signedIn) return false;
  if (input.visibility === "members") return true;
  return input.orgMember;
}

export interface AdAccessInput {
  readonly boardVisible: boolean;
  readonly lifecycle: ClassifiedLifecycle;
  readonly moderationStatus: ModerationStatus;
  readonly isAuthor: boolean;
  readonly manager: boolean;
}

/** Fiche visible : publiée + visible, ou auteur / gestionnaire (leurs propres non publiées). */
export function canViewAd(input: AdAccessInput): boolean {
  if (!input.boardVisible && !input.manager) return false;
  if (input.manager || input.isAuthor) return true;
  return isPubliclyListed(input.lifecycle, input.moderationStatus);
}

export function isPubliclyListed(lifecycle: ClassifiedLifecycle, moderation: ModerationStatus): boolean {
  return lifecycle === "published" && moderation === "visible";
}

export function submitLifecycle(preModeration: boolean): ClassifiedLifecycle {
  return preModeration ? "pending" : "published";
}

export function adModerationTransition(current: ModerationStatus, decision: ModerationDecisionName): ModerationStatus | null {
  if (decision === "hide") return current === "visible" ? "hidden" : null;
  if (decision === "spam") return current !== "spam" ? "spam" : null;
  if (decision === "restore") return current !== "visible" ? "visible" : null;
  return null;
}

export function clampPage(page: number, total: number, size = ADS_PAGE_SIZE): number {
  const last = Math.max(1, Math.ceil(total / size));
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), last);
}

export function slugifyAd(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "annonce";
}

export function expiresAtFrom(now: Date, durationDays: number): Date {
  const days = Math.min(DURATION_MAX, Math.max(DURATION_MIN, durationDays));
  return new Date(now.getTime() + days * 86_400_000);
}

export function canRenew(lifecycle: ClassifiedLifecycle, renewCount: number, maxRenewals: number): boolean {
  if (renewCount >= maxRenewals) return false;
  if (lifecycle === "published") return true;
  return lifecycle === "expired" && canTransition(lifecycle, "published");
}

export function defaultCondition(categoryRootSlug: string): "new" | "used" | "n_a" {
  return categoryRootSlug === "emploi" || categoryRootSlug === "services" ? "n_a" : "used";
}
