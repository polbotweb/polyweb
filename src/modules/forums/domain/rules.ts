/**
 * Règles pures du domaine forums (testables sans base) : visibilité, transitions de modération,
 * sondages, réputation, sanctions automatiques, limites de débit.
 */
import type { ForumContentStatus, ForumPollResults, ForumVisibility } from "../schema";
import type { ModerationDecisionName } from "@/core/moderation/registry";

export const NOT_FOUND_MESSAGE = "Élément introuvable.";
export const TOPIC_TITLE_MIN = 3;
export const TOPIC_TITLE_MAX = 200;
export const BODY_MIN = 2;
export const BODY_MAX = 20_000;
export const TOPICS_PAGE_SIZE = 20;
export const POSTS_PAGE_SIZE = 20;
export const MAX_TAGS_PER_TOPIC = 5;
export const MAX_PRIVATE_PARTICIPANTS = 20;
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 10;
export const NOTE_MIN = 3;
export const NOTE_MAX = 1000;

/** Limites de débit par utilisateur (fenêtre en secondes). */
export const FORUM_RATE_LIMITS = {
  topic: { window: 600, max: 5 },
  reply: { window: 600, max: 20 },
  vote: { window: 60, max: 60 },
  reaction: { window: 60, max: 60 },
  poll: { window: 60, max: 20 },
  invite: { window: 3600, max: 20 },
  follow: { window: 60, max: 30 },
} as const;
export type ForumRateLimitKind = keyof typeof FORUM_RATE_LIMITS;

export interface ForumAccessInput {
  readonly status: string;
  readonly visibility: ForumVisibility;
  readonly organizationId: string | null;
  readonly signedIn: boolean;
  readonly orgMember: boolean;
  /** Modérateur / gestionnaire du forum dans sa portée (org, site). */
  readonly manager: boolean;
}

/** Un forum est-il visible ? Brouillon/archivé : gestionnaires seulement. */
export function canViewForum(input: ForumAccessInput): boolean {
  if (input.manager) return true;
  if (input.status !== "PUBLISHED") return false;
  if (input.visibility === "public") return true;
  if (!input.signedIn) return false;
  if (input.visibility === "members") return true;
  return input.organizationId === null ? true : input.orgMember;
}

/**
 * Un sujet est-il visible ? Fil privé : participants SEULEMENT (même pour les modérateurs, qui ne
 * voient que l'extrait signalé dans la file). Masqué / spam : modérateurs seulement.
 */
export function canViewTopic(input: { forumVisible: boolean; status: ForumContentStatus; isPrivate: boolean; participant: boolean; manager: boolean }): boolean {
  if (!input.forumVisible) return false;
  if (input.isPrivate) return input.participant && (input.status === "visible" || input.manager);
  return input.status === "visible" || input.manager;
}

/** Transition de statut d'une décision de modération (`null` = sans effet, idempotent). */
export function forumContentTransition(current: string, decision: ModerationDecisionName): ForumContentStatus | null {
  if (decision === "restore") return current === "visible" ? null : "visible";
  if (decision === "spam") return current === "spam" ? null : "spam";
  return current === "visible" ? "hidden" : null;
}

/** Résultats d'un sondage visibles par ce lecteur ? */
export function pollResultsVisible(input: { mode: ForumPollResults; voted: boolean; closed: boolean }): boolean {
  if (input.mode === "always") return true;
  if (input.mode === "after_vote") return input.voted || input.closed;
  return input.closed;
}

export const pollClosed = (closesAt: Date | null, now = new Date()) => closesAt !== null && closesAt.getTime() <= now.getTime();

/** Bulletin valide : options du sondage, sans doublon ; choix simple = exactement une. */
export function validBallot(input: { multiple: boolean; optionIds: readonly string[]; pollOptionIds: readonly string[] }): boolean {
  const unique = new Set(input.optionIds);
  if (unique.size !== input.optionIds.length || unique.size === 0) return false;
  if (!input.multiple && unique.size !== 1) return false;
  return [...unique].every((id) => input.pollOptionIds.includes(id));
}

export const REPUTATION_POINTS = { upvote: 10, downvote: -2, accepted: 15 } as const;

export function reputationOf(input: { upvotes: number; downvotes: number; accepted: number }): number {
  return Math.max(0, input.upvotes * REPUTATION_POINTS.upvote + input.downvotes * REPUTATION_POINTS.downvote + input.accepted * REPUTATION_POINTS.accepted);
}

export interface SanctionPolicy {
  readonly enabled: boolean;
  readonly windowDays: number;
  readonly muteThreshold: number;
  readonly muteHours: number;
  readonly suspendThreshold: number;
  readonly suspendDays: number;
}

export const DEFAULT_SANCTION_POLICY: SanctionPolicy = { enabled: true, windowDays: 30, muteThreshold: 3, muteHours: 24, suspendThreshold: 5, suspendDays: 7 };

export function validSanctionPolicy(p: SanctionPolicy): boolean {
  const int = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  return int(p.windowDays, 1, 365) && int(p.muteThreshold, 1, 100) && int(p.suspendThreshold, 2, 200) && p.suspendThreshold > p.muteThreshold && int(p.muteHours, 1, 720) && int(p.suspendDays, 1, 365);
}

/**
 * Sanction automatique à appliquer après une décision retenue (masquage / spam) :
 * - `upheld` contenus masqués de l'auteur dans la fenêtre ≥ seuil de suspension → suspension ;
 * - ≥ seuil de mise en sourdine : récidive (une sourdine déjà prononcée dans la fenêtre) →
 *   suspension (escalade), sinon sourdine temporaire ;
 * - jamais de nouvelle sanction si une sanction équivalente ou plus forte est active.
 */
export function autoSanctionDecision(input: {
  readonly policy: SanctionPolicy;
  readonly upheld: number;
  readonly activeKinds: readonly ("mute" | "suspension")[];
  readonly priorMuteInWindow: boolean;
}): "mute" | "suspension" | null {
  const { policy, upheld } = input;
  if (!policy.enabled || upheld < policy.muteThreshold) return null;
  if (input.activeKinds.includes("suspension")) return null;
  if (upheld >= policy.suspendThreshold || input.priorMuteInWindow) return "suspension";
  return input.activeKinds.includes("mute") ? null : "mute";
}

export function sanctionEnd(kind: "mute" | "suspension", policy: SanctionPolicy, now = new Date()): Date {
  const ms = kind === "mute" ? policy.muteHours * 3_600_000 : policy.suspendDays * 86_400_000;
  return new Date(now.getTime() + ms);
}

/** Une sanction active bloque-t-elle cette activité ? Sourdine : publier ; suspension : tout. */
export function sanctionBlocks(kinds: readonly ("mute" | "suspension")[], activity: "post" | "interact"): boolean {
  if (kinds.includes("suspension")) return true;
  return activity === "post" && kinds.includes("mute");
}

export function slugifyForum(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/** Pagination bornée : page ≥ 1 et ≤ 1000. */
export const clampPage = (raw: unknown) => Math.min(1000, Math.max(1, Number.parseInt(String(raw ?? "1"), 10) || 1));
