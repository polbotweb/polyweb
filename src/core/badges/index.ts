/**
 * Badges (core, générique) : registre TYPÉ de règles par module + attribution idempotente.
 *
 * Un module déclare ses badges avec `defineBadges<Stats>(module, [...])` : chaque badge est une
 * règle pure sur des statistiques calculées par le module (ex. réputation d'un membre de forum).
 * `awardBadges(tx, …)` évalue les règles et insère les badges manquants dans `badge_awards`
 * (unicité module + portée + utilisateur + badge → `ON CONFLICT DO NOTHING`) : rejouer
 * l'évaluation ne réattribue jamais un badge ; seuls les badges NOUVEAUX sont renvoyés (pour
 * notifier une seule fois). Les badges ne sont jamais retirés automatiquement.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { badgeAwards } from "@database/schemas/badges.schema";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import type { DbTransaction } from "@/lib/effect/transaction";

export const BADGE_TIERS = ["bronze", "silver", "gold"] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];

export interface BadgeDefinition<S> {
  /** Identifiant stable (stocké) : kebab/snake, unique dans le module. */
  readonly id: string;
  readonly tier: BadgeTier;
  /** Règle pure : vrai si les statistiques méritent le badge. */
  readonly rule: (stats: S) => boolean;
}

export interface BadgeRegistry<S> {
  readonly module: string;
  readonly badges: readonly BadgeDefinition<S>[];
  readonly get: (id: string) => BadgeDefinition<S> | undefined;
  /** Badges dont la règle est satisfaite (ordre de déclaration). */
  readonly earned: (stats: S) => readonly string[];
}

const ID = /^[a-z][a-z0-9_-]{1,63}$/;

export function defineBadges<S>(module: string, badges: readonly BadgeDefinition<S>[]): BadgeRegistry<S> {
  const seen = new Set<string>();
  for (const badge of badges) {
    if (!ID.test(badge.id)) throw new Error(`Invalid badge id: ${module}.${badge.id}`);
    if (seen.has(badge.id)) throw new Error(`Duplicate badge: ${module}.${badge.id}`);
    seen.add(badge.id);
  }
  return {
    module,
    badges,
    get: (id) => badges.find((b) => b.id === id),
    earned: (stats) => badges.filter((b) => b.rule(stats)).map((b) => b.id),
  };
}

/** Attribue (idempotent) les badges mérités ; renvoie uniquement les nouveaux. */
export const awardBadges = <S>(tx: DbTransaction, registry: BadgeRegistry<S>, input: { readonly scopeId: string; readonly userId: string; readonly stats: S }) =>
  Effect.gen(function* () {
    const earned = registry.earned(input.stats);
    if (earned.length === 0) return [] as string[];
    const inserted = yield* dbTry("badges.award", () =>
      tx
        .insert(badgeAwards)
        .values(earned.map((badge) => ({ module: registry.module, scopeId: input.scopeId, userId: input.userId, badge })))
        .onConflictDoNothing()
        .returning({ badge: badgeAwards.badge }),
    );
    return inserted.map((r) => r.badge);
  });

/** Badges d'un utilisateur dans une portée (affichage). */
export const listBadges = (module: string, scopeId: string, userIds: readonly string[]) =>
  userIds.length === 0
    ? Effect.succeed([] as { userId: string; badge: string }[])
    : dbTry("badges.list", () =>
        getDrizzle()
          .select({ userId: badgeAwards.userId, badge: badgeAwards.badge })
          .from(badgeAwards)
          .where(and(eq(badgeAwards.module, module), eq(badgeAwards.scopeId, scopeId), inArray(badgeAwards.userId, [...userIds])))
          .orderBy(asc(badgeAwards.awardedAt)),
      );
