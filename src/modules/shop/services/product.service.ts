/**
 * Service Effect du domaine shop : mutations (création, mise à jour,
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
import { products, productRevisions } from "../schema";
import { shopLock } from "../locks";
import { shopWorkflow, type ShopStatus } from "../domain/workflow";

type Row = typeof products.$inferSelect;

const findById = (id: string) =>
  dbTry("shop.findById", () => getDrizzle().select().from(products).where(eq(products.id, id)).limit(1)).pipe(Effect.map((rows): Row | null => rows[0] ?? null));

const required = (id: string) =>
  Effect.flatMap(findById(id), (row) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Élément introuvable.")));

const revision = (row: Row, authorId: string, note: string) =>
  dbTry("shop.revision", () => getDrizzle().insert(productRevisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, note }));

export const shopService = {
  create: (input: { title: string; slug: string; organizationId: string | null }, authorId: string) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("shop.create", () => getDrizzle().insert(products).values({ ...input, createdBy: authorId }).returning());
      yield* revision(row, authorId, "Création");
      return row;
    }),

  update: (id: string, patch: { title?: string; slug?: string }, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* shopLock.ensureNotLockedByOther(id, owner, locale);
      yield* required(id);
      const [row] = yield* dbTry("shop.update", () => getDrizzle().update(products).set(patch).where(eq(products.id, id)).returning());
      yield* revision(row, owner.userId, "Mise à jour");
      return row;
    }),

  transition: (id: string, to: ShopStatus, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* shopLock.ensureNotLockedByOther(id, owner, locale);
      const current = yield* required(id);
      if (!canTransition(shopWorkflow, current.status, to)) return yield* fail("BAD_REQUEST", "Transition de statut invalide : " + current.status + " → " + to + ".");
      const [row] = yield* dbTry("shop.transition", () => getDrizzle().update(products).set({ status: to }).where(eq(products.id, id)).returning());
      yield* revision(row, owner.userId, "Transition " + current.status + " → " + to);
      return row;
    }),

  lock: (id: string, owner: LockOwner, options: { takeOver?: boolean; locale?: string } = {}) => shopLock.acquire(id, owner, options),
  unlock: (id: string, owner: LockOwner) => shopLock.release(id, owner),
};
