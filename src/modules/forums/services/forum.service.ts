/**
 * Service Effect du domaine forums (administration) : forums d'un site, catégories, étiquettes.
 * Accès base via `dbTry` (DbError typé), verrou d'édition core/locks, transitions core/workflow,
 * révision à chaque écriture de forum ; chaque écriture d'administration est auditée DANS sa
 * transaction (`forums.<ressource>.<action>`).
 */
import { Effect } from "effect";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { ActionFailure, fail } from "@/lib/effect/failure";
import type { DbError } from "@/lib/effect/errors";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { canTransition } from "@/core/workflow";
import type { LockOwner } from "@/core/locks/policy";
import { forumCategories, forumRevisions, forums, forumTags, forumTopics, type ForumCategoryTranslations, type ForumVisibility } from "../schema";
import { forumsLock } from "../locks";
import { forumsWorkflow, type ForumsStatus } from "../domain/workflow";
import { DEFAULT_FORUM, DEFAULT_FORUM_CATEGORIES } from "../domain/defaults";
import { NOT_FOUND_MESSAGE, slugifyForum } from "../domain/rules";
import { forumsAudit } from "./audit";

type Row = typeof forums.$inferSelect;
type Scope = { readonly siteId: string; readonly organizationId: string | null };

const findById = (id: string) =>
  dbTry("forums.findById", () => getDrizzle().select().from(forums).where(eq(forums.id, id)).limit(1)).pipe(Effect.map((rows): Row | null => rows[0] ?? null));

const required = (id: string) => Effect.flatMap(findById(id), (row) => (row ? Effect.succeed(row) : fail("NOT_FOUND", NOT_FOUND_MESSAGE)));

const revision = (tx: DbTransaction, row: Row, authorId: string, note: string) =>
  dbTry("forums.revision", () => tx.insert(forumRevisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, note }));

const slugOrFail = (raw: string) => {
  const slug = slugifyForum(raw);
  return slug.length >= 2 ? Effect.succeed(slug) : fail("BAD_REQUEST", "Identifiant d'URL invalide.");
};

/** Code Postgres 23505 n'importe où dans la chaîne de causes (DbError → DrizzleQueryError → pg). */
export const uniqueViolation = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

/** Violation d'unicité → CONFLICT (message métier), toute autre erreur base inchangée. */
const conflictOn = (message: string) => <A, R>(self: Effect.Effect<A, DbError, R>): Effect.Effect<A, DbError | ActionFailure, R> =>
  self.pipe(Effect.catchTag("DbError", (e): Effect.Effect<never, DbError | ActionFailure> => (uniqueViolation(e) ? fail("CONFLICT", message) : Effect.fail(e))));

export interface ForumInput {
  readonly title: string;
  readonly slug: string;
  readonly description?: string | null;
  readonly visibility: ForumVisibility;
  readonly position?: number;
}

const insertCategories = (tx: DbTransaction, forumId: string) =>
  dbTry("forums.categories.defaults", () =>
    tx.insert(forumCategories).values(DEFAULT_FORUM_CATEGORIES.map((c, i) => ({ forumId, slug: c.slug, translations: c.translations, position: i }))).onConflictDoNothing(),
  );

export const forumsService = {
  create: (scope: Scope, input: ForumInput, authorId: string, options: { withDefaultCategories?: boolean } = {}) =>
    Effect.gen(function* () {
      const slug = yield* slugOrFail(input.slug || input.title);
      return yield* dbTransaction("forums.create", (tx) =>
        Effect.gen(function* () {
          const [row] = yield* dbTry("forums.create.insert", () =>
            tx.insert(forums).values({ siteId: scope.siteId, organizationId: scope.organizationId, slug, title: input.title.trim(), description: input.description?.trim() || null, visibility: input.visibility, position: input.position ?? 0, createdBy: authorId }).returning(),
          ).pipe(conflictOn("Un forum utilise déjà cet identifiant."));
          if (options.withDefaultCategories !== false) yield* insertCategories(tx, row.id);
          yield* revision(tx, row, authorId, "Création");
          yield* forumsAudit(tx, { actorId: authorId, action: "forums.forum.create", resource: "forums.forum", resourceId: row.id, organizationId: scope.organizationId, siteId: scope.siteId, metadata: { slug, visibility: input.visibility } });
          return row;
        }),
      );
    }),

  update: (id: string, patch: Partial<ForumInput>, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* forumsLock.ensureNotLockedByOther(id, owner, locale);
      const current = yield* required(id);
      const slug = patch.slug !== undefined ? yield* slugOrFail(patch.slug) : undefined;
      return yield* dbTransaction("forums.update", (tx) =>
        Effect.gen(function* () {
          const [row] = yield* dbTry("forums.update.set", () =>
            tx.update(forums).set({
              ...(patch.title !== undefined ? { title: patch.title.trim() } : {}), ...(slug !== undefined ? { slug } : {}),
              ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
              ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}), ...(patch.position !== undefined ? { position: patch.position } : {}),
            }).where(eq(forums.id, id)).returning(),
          ).pipe(conflictOn("Un forum utilise déjà cet identifiant."));
          yield* revision(tx, row, owner.userId, "Mise à jour");
          yield* forumsAudit(tx, { actorId: owner.userId, action: "forums.forum.update", resource: "forums.forum", resourceId: id, organizationId: current.organizationId, siteId: current.siteId, metadata: { before: { slug: current.slug, visibility: current.visibility, title: current.title }, after: { slug: row.slug, visibility: row.visibility, title: row.title } } });
          return row;
        }),
      );
    }),

  transition: (id: string, to: ForumsStatus, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* forumsLock.ensureNotLockedByOther(id, owner, locale);
      const current = yield* required(id);
      if (!canTransition(forumsWorkflow, current.status, to)) return yield* fail("BAD_REQUEST", "Transition de statut invalide : " + current.status + " → " + to + ".");
      return yield* dbTransaction("forums.transition", (tx) =>
        Effect.gen(function* () {
          const [row] = yield* dbTry("forums.transition.set", () => tx.update(forums).set({ status: to }).where(eq(forums.id, id)).returning());
          yield* revision(tx, row, owner.userId, "Transition " + current.status + " → " + to);
          yield* forumsAudit(tx, { actorId: owner.userId, action: "forums.forum.transition", resource: "forums.forum", resourceId: id, organizationId: current.organizationId, siteId: current.siteId, metadata: { from: current.status, to } });
          return row;
        }),
      );
    }),

  lock: (id: string, owner: LockOwner, options: { takeOver?: boolean; locale?: string } = {}) => forumsLock.acquire(id, owner, options),
  unlock: (id: string, owner: LockOwner) => forumsLock.release(id, owner),
};

/**
 * Forum par défaut d'un site (publié, public) et ses catégories pré-remplies — idempotent :
 * créé une seule fois par site (unicité site + slug), jamais recréé après suppression des
 * catégories par l'administration. Aucun effet si le site a déjà au moins un forum.
 */
export const ensureSiteForum = (scope: Scope) =>
  Effect.gen(function* () {
    const existing = yield* dbTry("forums.ensure.count", () => getDrizzle().select({ id: forums.id }).from(forums).where(eq(forums.siteId, scope.siteId)).limit(1));
    if (existing.length > 0) return false;
    return yield* dbTransaction("forums.ensure", (tx) =>
      Effect.gen(function* () {
        const [row] = yield* dbTry("forums.ensure.insert", () =>
          tx.insert(forums).values({ siteId: scope.siteId, organizationId: scope.organizationId, slug: DEFAULT_FORUM.slug, title: DEFAULT_FORUM.title, description: DEFAULT_FORUM.description, visibility: "public", status: "PUBLISHED" })
            .onConflictDoNothing().returning({ id: forums.id }),
        );
        if (!row) return false;
        yield* insertCategories(tx, row.id);
        yield* forumsAudit(tx, { actorId: null, action: "forums.forum.seed", resource: "forums.forum", resourceId: row.id, organizationId: scope.organizationId, siteId: scope.siteId, metadata: { categories: DEFAULT_FORUM_CATEGORIES.map((c) => c.slug) } });
        return true;
      }),
    );
  });

export const listSiteForums = (siteId: string) =>
  dbTry("forums.list", () => getDrizzle().select().from(forums).where(eq(forums.siteId, siteId)).orderBy(asc(forums.position), asc(forums.title)));

export const listForumCategories = (forumIds: readonly string[]) =>
  forumIds.length === 0 ? Effect.succeed([] as (typeof forumCategories.$inferSelect)[]) : dbTry("forums.categories.list", () =>
    getDrizzle().select().from(forumCategories).where(inArray(forumCategories.forumId, [...forumIds])).orderBy(asc(forumCategories.position), asc(forumCategories.slug)),
  );

const forumOfSite = (forumId: string, siteId: string) =>
  dbTry("forums.ofSite", () => getDrizzle().select({ id: forums.id, organizationId: forums.organizationId }).from(forums).where(and(eq(forums.id, forumId), eq(forums.siteId, siteId))).limit(1)).pipe(
    Effect.flatMap(([row]) => (row ? Effect.succeed(row) : fail("NOT_FOUND", NOT_FOUND_MESSAGE))),
  );

const categoryOfSite = (categoryId: string, siteId: string) =>
  dbTry("forums.category.ofSite", () =>
    getDrizzle().select({ id: forumCategories.id, forumId: forumCategories.forumId, slug: forumCategories.slug, position: forumCategories.position, organizationId: forums.organizationId })
      .from(forumCategories).innerJoin(forums, eq(forums.id, forumCategories.forumId)).where(and(eq(forumCategories.id, categoryId), eq(forums.siteId, siteId))).limit(1),
  ).pipe(Effect.flatMap(([row]) => (row ? Effect.succeed(row) : fail("NOT_FOUND", NOT_FOUND_MESSAGE))));

const cleanTranslations = (t: ForumCategoryTranslations): ForumCategoryTranslations =>
  Object.fromEntries(Object.entries(t).filter(([, v]) => v.name?.trim()).map(([k, v]) => [k, { name: v.name.trim().slice(0, 80), description: (v.description ?? "").trim().slice(0, 300) }]));

export const categoriesService = {
  create: (siteId: string, input: { forumId: string; slug: string; translations: ForumCategoryTranslations }, actorId: string) =>
    Effect.gen(function* () {
      const forum = yield* forumOfSite(input.forumId, siteId);
      const translations = cleanTranslations(input.translations);
      if (Object.keys(translations).length === 0) return yield* fail("BAD_REQUEST", "Nom de catégorie obligatoire.");
      const slug = yield* slugOrFail(input.slug || Object.values(translations)[0].name);
      return yield* dbTransaction("forums.category.create", (tx) =>
        Effect.gen(function* () {
          const [{ next }] = yield* dbTry("forums.category.position", () => tx.select({ next: sql<number>`coalesce(max(${forumCategories.position}) + 1, 0)::int` }).from(forumCategories).where(eq(forumCategories.forumId, forum.id)));
          const [row] = yield* dbTry("forums.category.insert", () => tx.insert(forumCategories).values({ forumId: forum.id, slug, translations, position: next }).returning())
            .pipe(conflictOn("Une catégorie utilise déjà cet identifiant."));
          yield* forumsAudit(tx, { actorId, action: "forums.category.create", resource: "forums.category", resourceId: row.id, organizationId: forum.organizationId, siteId, metadata: { forumId: forum.id, slug } });
          return row;
        }),
      );
    }),

  update: (siteId: string, input: { categoryId: string; translations: ForumCategoryTranslations }, actorId: string) =>
    Effect.gen(function* () {
      const category = yield* categoryOfSite(input.categoryId, siteId);
      const translations = cleanTranslations(input.translations);
      if (Object.keys(translations).length === 0) return yield* fail("BAD_REQUEST", "Nom de catégorie obligatoire.");
      return yield* dbTransaction("forums.category.update", (tx) =>
        Effect.gen(function* () {
          yield* dbTry("forums.category.update.set", () => tx.update(forumCategories).set({ translations }).where(eq(forumCategories.id, category.id)));
          yield* forumsAudit(tx, { actorId, action: "forums.category.update", resource: "forums.category", resourceId: category.id, organizationId: category.organizationId, siteId, metadata: { locales: Object.keys(translations) } });
          return { updated: true as const };
        }),
      );
    }),

  /** Déplace d'un cran (haut / bas) en échangeant les positions — ordre total stable. */
  move: (siteId: string, input: { categoryId: string; direction: "up" | "down" }, actorId: string) =>
    Effect.gen(function* () {
      const category = yield* categoryOfSite(input.categoryId, siteId);
      return yield* dbTransaction("forums.category.move", (tx) =>
        Effect.gen(function* () {
          const siblings = yield* dbTry("forums.category.siblings", () =>
            tx.select({ id: forumCategories.id }).from(forumCategories).where(eq(forumCategories.forumId, category.forumId)).orderBy(asc(forumCategories.position), asc(forumCategories.slug)).for("update"),
          );
          const index = siblings.findIndex((s) => s.id === category.id);
          const target = input.direction === "up" ? index - 1 : index + 1;
          if (index < 0 || target < 0 || target >= siblings.length) return { moved: false as const };
          const order = siblings.map((s) => s.id);
          [order[index], order[target]] = [order[target], order[index]];
          for (const [position, id] of order.entries()) yield* dbTry("forums.category.reorder", () => tx.update(forumCategories).set({ position }).where(eq(forumCategories.id, id)));
          yield* forumsAudit(tx, { actorId, action: "forums.category.reorder", resource: "forums.category", resourceId: category.id, organizationId: category.organizationId, siteId, metadata: { direction: input.direction, from: index, to: target } });
          return { moved: true as const };
        }),
      );
    }),

  /** Suppression : les sujets de la catégorie sont d'abord déplacés vers `moveTo` (même forum). */
  remove: (siteId: string, input: { categoryId: string; moveTo: string | null }, actorId: string) =>
    Effect.gen(function* () {
      const category = yield* categoryOfSite(input.categoryId, siteId);
      return yield* dbTransaction("forums.category.delete", (tx) =>
        Effect.gen(function* () {
          const [{ topics }] = yield* dbTry("forums.category.topics", () => tx.select({ topics: sql<number>`count(*)::int` }).from(forumTopics).where(eq(forumTopics.categoryId, category.id)));
          if (topics > 0) {
            const target = input.moveTo ? yield* categoryOfSite(input.moveTo, siteId) : null;
            if (!target || target.forumId !== category.forumId || target.id === category.id) return yield* fail("BAD_REQUEST", "Choisissez une autre catégorie du même forum pour y déplacer les sujets.");
            yield* dbTry("forums.category.moveTopics", () => tx.update(forumTopics).set({ categoryId: target.id }).where(eq(forumTopics.categoryId, category.id)));
          }
          yield* dbTry("forums.category.delete.row", () => tx.delete(forumCategories).where(eq(forumCategories.id, category.id)));
          yield* forumsAudit(tx, { actorId, action: "forums.category.delete", resource: "forums.category", resourceId: category.id, organizationId: category.organizationId, siteId, metadata: { slug: category.slug, movedTopics: topics, moveTo: input.moveTo } });
          return { deleted: true as const, movedTopics: topics };
        }),
      );
    }),
};

export const listSiteTags = (siteId: string) =>
  dbTry("forums.tags.list", () => getDrizzle().select().from(forumTags).where(eq(forumTags.siteId, siteId)).orderBy(asc(forumTags.label)));

export const tagsService = {
  create: (scope: Scope, input: { label: string }, actorId: string) =>
    Effect.gen(function* () {
      const label = input.label.trim().slice(0, 40);
      const slug = yield* slugOrFail(label);
      return yield* dbTransaction("forums.tag.create", (tx) =>
        Effect.gen(function* () {
          const [row] = yield* dbTry("forums.tag.insert", () => tx.insert(forumTags).values({ siteId: scope.siteId, slug: slug.slice(0, 40), label }).returning())
            .pipe(conflictOn("Cette étiquette existe déjà."));
          yield* forumsAudit(tx, { actorId, action: "forums.tag.create", resource: "forums.tag", resourceId: row.id, organizationId: scope.organizationId, siteId: scope.siteId, metadata: { slug: row.slug } });
          return row;
        }),
      );
    }),
  remove: (scope: Scope, tagId: string, actorId: string) =>
    dbTransaction("forums.tag.delete", (tx) =>
      Effect.gen(function* () {
        const [row] = yield* dbTry("forums.tag.delete.row", () => tx.delete(forumTags).where(and(eq(forumTags.id, tagId), eq(forumTags.siteId, scope.siteId))).returning({ slug: forumTags.slug }));
        if (!row) return yield* fail("NOT_FOUND", NOT_FOUND_MESSAGE);
        yield* forumsAudit(tx, { actorId, action: "forums.tag.delete", resource: "forums.tag", resourceId: tagId, organizationId: scope.organizationId, siteId: scope.siteId, metadata: { slug: row.slug } });
        return { deleted: true as const };
      }),
    ),
};
