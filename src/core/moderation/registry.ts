/**
 * Registre de modération (docs/moderation.md). Chaque module déclare ses cibles modérables dans
 * `src/modules/<module>/moderation/adapters.ts` (`defineModuleModeration`) ; l'agrégat
 * `src/modules/moderation.ts` (rempli par `pnpm module:new`) les enregistre au démarrage.
 *
 * Un adaptateur ne fait que lire/écrire la table de son module : la visibilité métier (ex.
 * `blog_comments.status`) reste l'unique source de vérité. Le cœur gère signalements, décisions
 * motivées, historique, audit et outbox dans la MÊME transaction que `apply`.
 */
import type { Effect } from "effect";
import type { getDrizzle } from "@database/drizzle";
import type { DbError } from "@/lib/effect/errors";
import type { DbTransaction } from "@/lib/effect/transaction";
import type { PermissionSet } from "@/core/permissions/tenant";

/** Connexion ou transaction courante : les lectures d'un adaptateur suivent l'appelant. */
export type ModerationExecutor = DbTransaction | ReturnType<typeof getDrizzle>;

/** Décisions sur la visibilité d'un contenu (pas de suppression définitive, pas d'édition). */
export const MODERATION_DECISIONS = ["hide", "restore", "spam"] as const;
export type ModerationDecisionName = (typeof MODERATION_DECISIONS)[number];
/** Issues d'un lot de signalements d'une cible. */
export const MODERATION_OUTCOMES = ["resolved", "dismissed"] as const;
export type ModerationOutcome = (typeof MODERATION_OUTCOMES)[number];

/** État d'une cible tel que lu dans la table du module (jamais exposé aux signaleurs). */
export interface ModerationTargetInfo {
  readonly organizationId: string | null;
  readonly siteId: string | null;
  readonly authorId: string | null;
  /** Statut métier courant (ex. `APPROVED`). */
  readonly status: string;
  /** Visible publiquement : seule condition pour être signalable. */
  readonly publiclyVisible: boolean;
}

/** Extrait réservé aux modérateurs autorisés (texte brut, échappé au rendu). */
export interface ModerationExcerpt {
  readonly title: string | null;
  readonly text: string;
  readonly url: string | null;
}

export interface ModerationTargetAdapter {
  /** Type de cible dans le module (ex. `comment`). */
  readonly type: string;
  /** Permission requise pour modérer cette cible, évaluée dans la portée (organisation, site) de la cible. */
  readonly permission: PermissionSet;
  /** Qui peut signaler : tout visiteur, ou utilisateur connecté seulement. */
  readonly reporters: "anyone" | "authenticated";
  readonly load: (executor: ModerationExecutor, id: string) => Effect.Effect<ModerationTargetInfo | null, DbError>;
  readonly excerpt: (executor: ModerationExecutor, id: string, locale: string) => Effect.Effect<ModerationExcerpt | null, DbError>;
  /**
   * Applique une décision dans `tx` (et ses effets métier : ex. recalcul des notes). Retourne le
   * nouveau statut, ou `null` si la décision ne change rien (idempotence). Absent : cible
   * « signalement seulement » (ex. article, service), dont le statut éditorial n'est jamais modifié.
   */
  readonly apply?: (tx: DbTransaction, id: string, decision: ModerationDecisionName, current: ModerationTargetInfo) => Effect.Effect<string | null, DbError>;
  /** Invalidation de caches après COMMIT. */
  readonly afterCommit?: () => void;
}

export interface ModuleModeration {
  readonly module: string;
  readonly targets: readonly ModerationTargetAdapter[];
}

export interface RegisteredModerationTarget extends ModerationTargetAdapter {
  readonly module: string;
  /** `module.type`. */
  readonly key: string;
}

const NAME = /^[a-z][a-z0-9_-]*$/;
const targets = new Map<string, RegisteredModerationTarget>();

export const moderationTargetKey = (module: string, type: string) => `${module}.${type}`;

export function defineModuleModeration(module: string, list: readonly ModerationTargetAdapter[]): ModuleModeration {
  return { module, targets: list };
}

export function registerModuleModeration(entry: ModuleModeration): void {
  if (!NAME.test(entry.module)) throw new Error(`Invalid moderation module: ${entry.module}`);
  for (const target of entry.targets) {
    if (!NAME.test(target.type)) throw new Error(`Invalid moderation target type: ${entry.module}.${target.type}`);
    if (Object.keys(target.permission).length === 0) throw new Error(`Moderation target ${entry.module}.${target.type} needs a permission`);
    const key = moderationTargetKey(entry.module, target.type);
    targets.set(key, { ...target, module: entry.module, key });
  }
}

export const getModerationTarget = (key: string): RegisteredModerationTarget | undefined => targets.get(key);
export const listModerationTargets = (): readonly RegisteredModerationTarget[] => [...targets.values()];

export function clearModerationTargetsForTests(): void {
  targets.clear();
}
