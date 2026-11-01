/**
 * Service Effect du domaine subscriptions : mutations (création, mise à jour,
 * transition de workflow, verrou). Accès base via `dbTry` (DbError typé),
 * verrou via core/locks, transitions via core/workflow, révisions à chaque écriture.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { fail } from "@/lib/effect/action";
import { canTransition } from "@/core/workflow";
import type { LockOwner } from "@/core/locks/policy";
import { subscriptions, subscriptionRevisions } from "../schema";
import { subscriptionsLock } from "../locks";
import { subscriptionsWorkflow, type SubscriptionsStatus } from "../domain/workflow";

type Row = typeof subscriptions.$inferSelect;

const findById = (id: string) =>
  dbTry("subscriptions.findById", () => getDrizzle().select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1)).pipe(Effect.map((rows): Row | null => rows[0] ?? null));

const required = (id: string) =>
  Effect.flatMap(findById(id), (row) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Élément introuvable.")));

const revision = (row: Row, authorId: string, note: string) =>
  dbTry("subscriptions.revision", () => getDrizzle().insert(subscriptionRevisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, note }));

export const subscriptionsService = {
  create: (input: { title: string; slug: string; organizationId: string | null }, authorId: string) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("subscriptions.create", () => getDrizzle().insert(subscriptions).values({ ...input, createdBy: authorId }).returning());
      yield* revision(row, authorId, "Création");
      return row;
    }),

  update: (id: string, patch: { title?: string; slug?: string }, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* subscriptionsLock.ensureNotLockedByOther(id, owner, locale);
      yield* required(id);
      const [row] = yield* dbTry("subscriptions.update", () => getDrizzle().update(subscriptions).set(patch).where(eq(subscriptions.id, id)).returning());
      yield* revision(row, owner.userId, "Mise à jour");
      return row;
    }),

  transition: (id: string, to: SubscriptionsStatus, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* subscriptionsLock.ensureNotLockedByOther(id, owner, locale);
      const current = yield* required(id);
      if (!canTransition(subscriptionsWorkflow, current.status, to)) return yield* fail("BAD_REQUEST", "Transition de statut invalide : " + current.status + " → " + to + ".");
      const [row] = yield* dbTry("subscriptions.transition", () => getDrizzle().update(subscriptions).set({ status: to }).where(eq(subscriptions.id, id)).returning());
      yield* revision(row, owner.userId, "Transition " + current.status + " → " + to);
      return row;
    }),

  lock: (id: string, owner: LockOwner, options: { takeOver?: boolean; locale?: string } = {}) => subscriptionsLock.acquire(id, owner, options),
  unlock: (id: string, owner: LockOwner) => subscriptionsLock.release(id, owner),
};
