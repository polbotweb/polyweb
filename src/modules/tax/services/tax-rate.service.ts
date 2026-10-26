/**
 * Service Effect du domaine tax : mutations (création, mise à jour,
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
import { tax, taxRateRevisions } from "../schema";
import { taxLock } from "../locks";
import { taxWorkflow, type TaxStatus } from "../domain/workflow";
import type { CustomerType, TaxCategory } from "../domain/rules";

type Row = typeof tax.$inferSelect;

const findById = (id: string) =>
  dbTry("tax.findById", () => getDrizzle().select().from(tax).where(eq(tax.id, id)).limit(1)).pipe(Effect.map((rows): Row | null => rows[0] ?? null));

const required = (id: string) =>
  Effect.flatMap(findById(id), (row) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Élément introuvable.")));

/** Instantané complet du taux (audit des changements de taux et de validité). */
export const taxRevisionValues = (row: Row, authorId: string, note: string, status: TaxStatus = row.status) => ({
  resourceId: row.id, authorId, title: row.title, slug: row.slug, status, note,
  countryCode: row.countryCode, category: row.category, customerType: row.customerType, ratePercent: row.ratePercent, validFrom: row.validFrom, validTo: row.validTo,
});

const revision = (row: Row, authorId: string, note: string) =>
  dbTry("tax.revision", () => getDrizzle().insert(taxRateRevisions).values(taxRevisionValues(row, authorId, note)));

/** Champs métier d'un taux (validés par les actions). */
export interface TaxRateFields {
  countryCode: string;
  category: TaxCategory;
  customerType: CustomerType | null;
  ratePercent: string;
  validFrom: string | null;
  validTo: string | null;
}

export const taxService = {
  create: (input: { title: string; slug: string; organizationId: string | null } & TaxRateFields, authorId: string) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("tax.create", () => getDrizzle().insert(tax).values({ ...input, createdBy: authorId }).returning());
      yield* revision(row, authorId, "Création");
      return row;
    }),

  update: (id: string, patch: { title?: string; slug?: string } & Partial<TaxRateFields>, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* taxLock.ensureNotLockedByOther(id, owner, locale);
      const current = yield* required(id);
      const validFrom = patch.validFrom === undefined ? current.validFrom : patch.validFrom;
      const validTo = patch.validTo === undefined ? current.validTo : patch.validTo;
      if (validFrom && validTo && validTo <= validFrom) return yield* fail("BAD_REQUEST", "La fin de validité doit suivre le début.");
      const [row] = yield* dbTry("tax.update", () => getDrizzle().update(tax).set(patch).where(eq(tax.id, id)).returning());
      yield* revision(row, owner.userId, "Mise à jour");
      return row;
    }),

  transition: (id: string, to: TaxStatus, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* taxLock.ensureNotLockedByOther(id, owner, locale);
      const current = yield* required(id);
      if (!canTransition(taxWorkflow, current.status, to)) return yield* fail("BAD_REQUEST", "Transition de statut invalide : " + current.status + " → " + to + ".");
      const [row] = yield* dbTry("tax.transition", () => getDrizzle().update(tax).set({ status: to }).where(eq(tax.id, id)).returning());
      yield* revision(row, owner.userId, "Transition " + current.status + " → " + to);
      return row;
    }),

  lock: (id: string, owner: LockOwner, options: { takeOver?: boolean; locale?: string } = {}) => taxLock.acquire(id, owner, options),
  unlock: (id: string, owner: LockOwner) => taxLock.release(id, owner),
};
