/**
 * Taxonomie de catégories GÉNÉRIQUE du cœur (Effect) — contrat auquel tout module adhère.
 *
 * Pas de table polymorphe (TODO §11 / §21) : chaque module possède SES tables explicites,
 * de forme commune (celle de `blog_categories`, déjà partagée par `service_categories`) :
 *
 * ```text
 * <entité>_categories              id, organization_id, parent_id, slug, icon, color, sort_order
 * <entité>_category_translations   category_id, organization_id, locale, name, slug, description
 * <liaison contenu ↔ catégorie>    <ressource>_id, category_id (clé primaire composite)
 * ```
 *
 * `defineCategoryTaxonomy` transforme ces tables (et les colonnes du contenu) en un
 * stockage Effect complet, sans migration pour les tables existantes (blog, services) :
 * - lecture plate / arbre localisés, toujours dans le tenant (`null` = plateforme, jamais de repli) ;
 * - création / modification / suppression : parent du même tenant, pas d'auto-parenté
 *   ni de cycle (`assertAcyclicParent`), suppression refusée s'il reste des enfants ;
 * - liaisons d'une ressource : catégories du tenant de la RESSOURCE uniquement ;
 * - filtre SQL « catégorie » et facette comptée (core/filters) pour les listes admin.
 *
 * Échecs typés : `NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`, `DbError`.
 */
import { and, asc, count, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { Effect } from "effect";
import { getDrizzle } from "@/database/drizzle";
import type { Locale } from "@i18n/config";
import { ConflictError, DbError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/effect/errors";
import { dbTry } from "@/lib/effect/run";
import type { FacetSpec } from "@/core/filters/facets";
import { assertAcyclicParent } from "@/lib/cms/taxonomy";

type Column = AnyPgColumn;

/** Colonnes exigées de la table des catégories. */
export interface CategoryColumns { readonly id: Column; readonly organizationId: Column; readonly parentId: Column; readonly slug: Column; readonly sortOrder: Column; readonly icon: Column; readonly color: Column }
/** Colonnes exigées de la table des traductions (localisation relationnelle, une ligne par locale). */
export interface CategoryTranslationColumns { readonly categoryId: Column; readonly organizationId: Column; readonly locale: Column; readonly name: Column; readonly slug: Column; readonly description: Column }
/** Colonnes du contenu catégorisé (tenant de la ressource). */
export interface CategorizedContentColumns { readonly id: Column; readonly organizationId: Column }

export interface CategoryTaxonomyConfig<
  C extends PgTable & CategoryColumns,
  T extends PgTable & CategoryTranslationColumns,
  L extends PgTable,
  R extends PgTable & CategorizedContentColumns,
> {
  /** Type de ressource (module), ex. « events ». */
  readonly resourceType: string;
  readonly categories: C;
  readonly translations: T;
  readonly links: L;
  /** Clé (propriété Drizzle) de la colonne ressource de la liaison, ex. « eventId », « postId ». */
  readonly linkResourceKey: keyof L & string;
  /** Clé de la colonne catégorie de la liaison (« categoryId »). */
  readonly linkCategoryKey: keyof L & string;
  readonly content: R;
}

export interface CategoryTranslationInput { readonly locale: Locale; readonly name: string; readonly slug: string; readonly description?: string | null }
export interface CategoryInput {
  readonly slug: string;
  readonly parentId?: string | null;
  readonly sortOrder?: number;
  readonly icon?: string | null;
  readonly color?: string | null;
  readonly translations: readonly CategoryTranslationInput[];
}
export type CategoryPatch = Partial<Omit<CategoryInput, "translations">> & { readonly translations?: readonly CategoryTranslationInput[] };

export interface CategoryRecord {
  readonly id: string;
  readonly organizationId: string | null;
  readonly parentId: string | null;
  readonly slug: string;
  readonly sortOrder: number;
  readonly icon: string | null;
  readonly color: string | null;
  /** Libellé localisé (`null` si la locale demandée n'est pas traduite : aucun repli silencieux). */
  readonly name: string | null;
  readonly localizedSlug: string | null;
  readonly description: string | null;
}
export interface CategoryTreeNode extends CategoryRecord { readonly children: readonly CategoryTreeNode[] }
export interface CategoryRef { readonly id: string; readonly slug: string; readonly name: string | null }

export interface CategoryTaxonomy {
  readonly resourceType: string;
  readonly list: (organizationId: string | null, locale: Locale) => Effect.Effect<CategoryRecord[], DbError>;
  readonly tree: (organizationId: string | null, locale: Locale) => Effect.Effect<CategoryTreeNode[], DbError>;
  /** Organisation d'une catégorie (`[]` si introuvable) — pour `requireTenantResourcePermission`. */
  readonly organizationOf: (categoryId: string) => Promise<ReadonlyArray<{ organizationId: string | null }>>;
  /** Organisation d'une ressource catégorisée (`[]` si introuvable). */
  readonly resourceOrganizationOf: (resourceId: string) => Promise<ReadonlyArray<{ organizationId: string | null }>>;
  readonly create: (organizationId: string | null, input: CategoryInput) => Effect.Effect<{ id: string }, DbError | ValidationError | ConflictError>;
  readonly update: (id: string, patch: CategoryPatch) => Effect.Effect<{ id: string }, DbError | NotFoundError | ValidationError | ConflictError>;
  readonly remove: (id: string) => Effect.Effect<void, DbError | NotFoundError | ConflictError>;
  /** Remplace les catégories d'une ressource (catégories du tenant de la ressource uniquement). */
  readonly setResourceCategories: (resourceId: string, categoryIds: readonly string[]) => Effect.Effect<void, DbError | NotFoundError | ForbiddenError>;
  readonly categoriesOf: (organizationId: string | null, locale: Locale, resourceIds: readonly string[]) => Effect.Effect<Map<string, CategoryRef[]>, DbError>;
  /** Condition « la ressource porte la catégorie » (dans le tenant), pour les listes. */
  readonly filterCondition: (organizationId: string | null, categoryId: string) => SQL;
  /** Facette « catégorie » (core/filters) : comptes par catégorie, avec les autres filtres actifs. */
  readonly facet: <F extends object>(filterKey: keyof F & string, organizationId: string | null, conditions: (filtersWithoutSelf: F) => SQL[]) => FacetSpec<F>;
}

/** Portée tenant stricte : `null` = plateforme (IS NULL), sinon égalité — jamais de repli. */
export const categoryTenantScope = (column: Column, organizationId: string | null): SQL =>
  organizationId === null ? isNull(column) : eq(column, organizationId);

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Validation du contrat d'entrée (slugs, couleur, traductions uniques par locale, libellés non vides). */
export function validateCategoryInput(input: CategoryPatch): ValidationError | null {
  const issues: { path: string; message: string }[] = [];
  if (input.slug !== undefined && (!SLUG.test(input.slug) || input.slug.length > 120)) issues.push({ path: "slug", message: "Slug invalide (a-z, 0-9, tirets)." });
  if (input.color !== undefined && input.color !== null && !COLOR.test(input.color)) issues.push({ path: "color", message: "Couleur invalide (#RRGGBB)." });
  if (input.sortOrder !== undefined && (!Number.isInteger(input.sortOrder) || input.sortOrder < 0)) issues.push({ path: "sortOrder", message: "Ordre invalide." });
  const locales = new Set<string>();
  for (const [i, t] of (input.translations ?? []).entries()) {
    if (locales.has(t.locale)) issues.push({ path: `translations.${i}.locale`, message: "Locale en double." });
    locales.add(t.locale);
    if (!t.name.trim() || t.name.length > 100) issues.push({ path: `translations.${i}.name`, message: "Nom requis (100 caractères max)." });
    if (!SLUG.test(t.slug) || t.slug.length > 120) issues.push({ path: `translations.${i}.slug`, message: "Slug invalide (a-z, 0-9, tirets)." });
  }
  return issues.length ? new ValidationError({ issues }) : null;
}

/** Construit l'arbre (enfants triés par `sortOrder` puis slug) à partir d'une liste plate du même tenant. */
export function buildCategoryTree(records: readonly CategoryRecord[]): CategoryTreeNode[] {
  const children = new Map<string | null, CategoryRecord[]>();
  const ids = new Set(records.map((r) => r.id));
  for (const record of records) {
    const parent = record.parentId !== null && ids.has(record.parentId) ? record.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), record]);
  }
  const visit = (parent: string | null, seen: ReadonlySet<string>): CategoryTreeNode[] =>
    [...(children.get(parent) ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
      .filter((r) => !seen.has(r.id))
      .map((r) => ({ ...r, children: visit(r.id, new Set([...seen, r.id])) }));
  return visit(null, new Set());
}

const isUniqueViolation = (cause: unknown): boolean => {
  let current: unknown = cause;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

/** Contrat minimal du client Drizzle utilisé ici (tables génériques, comme `drizzleLockStore`). */
interface TaxonomyDb {
  select: (fields?: unknown) => {
    from: (t: PgTable) => {
      where: (w: SQL | undefined) => Promise<Record<string, unknown>[]> & { limit: (n: number) => Promise<Record<string, unknown>[]>; orderBy: (...c: SQL[]) => Promise<Record<string, unknown>[]>; groupBy: (c: Column) => Promise<Record<string, unknown>[]> };
      leftJoin: (t: PgTable, on: SQL | undefined) => { where: (w: SQL | undefined) => { orderBy: (...c: SQL[]) => Promise<Record<string, unknown>[]> } };
      innerJoin: (t: PgTable, on: SQL | undefined) => {
        leftJoin: (t: PgTable, on: SQL | undefined) => { where: (w: SQL | undefined) => Promise<Record<string, unknown>[]> };
        innerJoin: (t: PgTable, on: SQL | undefined) => { where: (w: SQL | undefined) => { groupBy: (c: Column) => Promise<Record<string, unknown>[]> } };
      };
    };
  };
  insert: (t: PgTable) => { values: (v: Record<string, unknown> | Record<string, unknown>[]) => Promise<unknown> & { returning: (f: Record<string, Column>) => Promise<Record<string, unknown>[]>; onConflictDoNothing: () => Promise<unknown> } };
  update: (t: PgTable) => { set: (v: Record<string, unknown>) => { where: (w: SQL | undefined) => Promise<unknown> } };
  delete: (t: PgTable) => { where: (w: SQL | undefined) => Promise<unknown> };
  transaction: <A>(f: (tx: TaxonomyDb) => Promise<A>) => Promise<A>;
}

/** Stockage générique d'un module (voir l'en-tête). */
export function defineCategoryTaxonomy<
  C extends PgTable & CategoryColumns,
  T extends PgTable & CategoryTranslationColumns,
  L extends PgTable,
  R extends PgTable & CategorizedContentColumns,
>(config: CategoryTaxonomyConfig<C, T, L, R>): CategoryTaxonomy {
  const { categories: cat, translations: tr, links, content, resourceType } = config;
  const linkResource = links[config.linkResourceKey] as unknown as Column;
  const linkCategory = links[config.linkCategoryKey] as unknown as Column;
  const db = () => getDrizzle() as unknown as TaxonomyDb;
  const op = (name: string) => `taxonomy.${resourceType}.${name}`;

  const fields = { id: cat.id, organizationId: cat.organizationId, parentId: cat.parentId, slug: cat.slug, sortOrder: cat.sortOrder, icon: cat.icon, color: cat.color, name: tr.name, localizedSlug: tr.slug, description: tr.description };
  const list = (organizationId: string | null, locale: Locale) =>
    dbTry(op("list"), () =>
      db().select(fields).from(cat)
        .leftJoin(tr, and(eq(tr.categoryId, cat.id), eq(tr.locale, locale), categoryTenantScope(tr.organizationId, organizationId)))
        .where(categoryTenantScope(cat.organizationId, organizationId))
        .orderBy(asc(cat.sortOrder), asc(cat.slug)),
    ).pipe(Effect.map((rows) => rows as unknown as CategoryRecord[]));

  const scopeNodes = (organizationId: string | null) =>
    dbTry(op("scope"), () => db().select({ id: cat.id, parentId: cat.parentId }).from(cat).where(categoryTenantScope(cat.organizationId, organizationId)))
      .pipe(Effect.map((rows) => rows as unknown as { id: string; parentId: string | null }[]));

  const checkParent = (organizationId: string | null, nodeId: string | null, parentId: string | null) =>
    Effect.gen(function* () {
      if (parentId === null) return;
      const nodes = yield* scopeNodes(organizationId);
      yield* Effect.try({ try: () => assertAcyclicParent(nodes, nodeId, parentId), catch: (e) => new ValidationError({ issues: [{ path: "parentId", message: e instanceof Error ? e.message : "Parent invalide." }] }) });
    });

  const writeTry = <A>(name: string, f: () => Promise<A>): Effect.Effect<A, DbError | ConflictError> =>
    Effect.tryPromise({
      try: f,
      catch: (cause) => isUniqueViolation(cause) ? new ConflictError({ reason: "Ce slug est déjà utilisé dans cette organisation." }) : new DbError({ operation: op(name), cause }),
    });

  const translationRows = (categoryId: string, organizationId: string | null, translations: readonly CategoryTranslationInput[]) =>
    translations.map((t) => ({ categoryId, organizationId, locale: t.locale, name: t.name.trim(), slug: t.slug, description: t.description ?? null }));

  const readCategory = (id: string) =>
    dbTry(op("read"), () => db().select({ id: cat.id, organizationId: cat.organizationId, parentId: cat.parentId }).from(cat).where(eq(cat.id, id)).limit(1)).pipe(
      Effect.flatMap(([row]) => row ? Effect.succeed(row as unknown as { id: string; organizationId: string | null; parentId: string | null }) : Effect.fail(new NotFoundError({ entity: `${resourceType}.category`, id }))),
    );

  return {
    resourceType,
    list,
    tree: (organizationId, locale) => list(organizationId, locale).pipe(Effect.map(buildCategoryTree)),
    organizationOf: (categoryId) => db().select({ organizationId: cat.organizationId }).from(cat).where(eq(cat.id, categoryId)).limit(1) as unknown as Promise<{ organizationId: string | null }[]>,
    resourceOrganizationOf: (resourceId) => db().select({ organizationId: content.organizationId }).from(content).where(eq(content.id, resourceId)).limit(1) as unknown as Promise<{ organizationId: string | null }[]>,
    create: (organizationId, input) =>
      Effect.gen(function* () {
        const invalid = validateCategoryInput(input);
        if (invalid) return yield* Effect.fail(invalid);
        if (input.translations.length === 0) return yield* Effect.fail(new ValidationError({ issues: [{ path: "translations", message: "Au moins une traduction est requise." }] }));
        const parentId = input.parentId ?? null;
        yield* checkParent(organizationId, null, parentId);
        return yield* writeTry("create", () => db().transaction(async (tx) => {
          const [row] = await tx.insert(cat).values({ organizationId, parentId, slug: input.slug, sortOrder: input.sortOrder ?? 0, icon: input.icon ?? null, color: input.color ?? null }).returning({ id: cat.id });
          const id = String(row!.id);
          await tx.insert(tr).values(translationRows(id, organizationId, input.translations));
          return { id };
        }));
      }),
    update: (id, patch) =>
      Effect.gen(function* () {
        const invalid = validateCategoryInput(patch);
        if (invalid) return yield* Effect.fail(invalid);
        const current = yield* readCategory(id);
        if (patch.parentId !== undefined) yield* checkParent(current.organizationId, id, patch.parentId);
        const set: Record<string, unknown> = {};
        for (const key of ["slug", "parentId", "sortOrder", "icon", "color"] as const) if (patch[key] !== undefined) set[key] = patch[key];
        return yield* writeTry("update", () => db().transaction(async (tx) => {
          if (Object.keys(set).length) await tx.update(cat).set(set).where(eq(cat.id, id));
          if (patch.translations) {
            await tx.delete(tr).where(eq(tr.categoryId, id));
            if (patch.translations.length) await tx.insert(tr).values(translationRows(id, current.organizationId, patch.translations));
          }
          return { id };
        }));
      }),
    remove: (id) =>
      Effect.gen(function* () {
        yield* readCategory(id);
        const children = yield* dbTry(op("children"), () => db().select({ id: cat.id }).from(cat).where(eq(cat.parentId, id)).limit(1));
        if (children.length) return yield* Effect.fail(new ConflictError({ reason: "Cette catégorie a des sous-catégories : déplacez-les ou supprimez-les d'abord." }));
        yield* dbTry(op("remove"), () => db().delete(cat).where(eq(cat.id, id)));
      }),
    setResourceCategories: (resourceId, categoryIds) =>
      Effect.gen(function* () {
        const [resource] = yield* dbTry(op("resource"), () => db().select({ organizationId: content.organizationId }).from(content).where(eq(content.id, resourceId)).limit(1));
        if (!resource) return yield* Effect.fail(new NotFoundError({ entity: resourceType, id: resourceId }));
        const organizationId = (resource.organizationId as string | null) ?? null;
        const unique = [...new Set(categoryIds)];
        if (unique.length) {
          const owned = yield* dbTry(op("owned"), () => db().select({ id: cat.id }).from(cat).where(and(inArray(cat.id, unique), categoryTenantScope(cat.organizationId, organizationId))));
          if (owned.length !== unique.length) return yield* Effect.fail(new ForbiddenError({ reason: "Catégorie hors de l'organisation de la ressource." }));
        }
        yield* dbTry(op("setLinks"), () => db().transaction(async (tx) => {
          await tx.delete(links).where(eq(linkResource, resourceId));
          if (unique.length) await tx.insert(links).values(unique.map((categoryId) => ({ [config.linkResourceKey]: resourceId, [config.linkCategoryKey]: categoryId })));
        }));
      }),
    categoriesOf: (organizationId, locale, resourceIds) =>
      resourceIds.length === 0
        ? Effect.succeed(new Map())
        : dbTry(op("categoriesOf"), () =>
            db().select({ resourceId: linkResource, id: cat.id, slug: cat.slug, name: tr.name }).from(links)
              .innerJoin(cat, and(eq(cat.id, linkCategory), categoryTenantScope(cat.organizationId, organizationId)))
              .leftJoin(tr, and(eq(tr.categoryId, cat.id), eq(tr.locale, locale), categoryTenantScope(tr.organizationId, organizationId)))
              .where(inArray(linkResource, [...resourceIds])),
          ).pipe(Effect.map((rows) => {
            const byResource = new Map<string, CategoryRef[]>();
            for (const row of rows as unknown as (CategoryRef & { resourceId: string })[]) byResource.set(row.resourceId, [...(byResource.get(row.resourceId) ?? []), { id: row.id, slug: row.slug, name: row.name ?? null }]);
            return byResource;
          })),
    filterCondition: (organizationId, categoryId) =>
      inArray(content.id, (getDrizzle().select({ resourceId: linkResource }).from(links as PgTable)
        .innerJoin(cat as PgTable, and(eq(cat.id, linkCategory), categoryTenantScope(cat.organizationId, organizationId)))
        .where(eq(linkCategory, categoryId))) as unknown as SQL),
    facet: <F extends object>(filterKey: keyof F & string, organizationId: string | null, conditions: (f: F) => SQL[]): FacetSpec<F> => ({
      id: "category",
      filterKey,
      count: async (without) => {
        const rows = await db().select({ value: linkCategory, count: count() }).from(links)
          .innerJoin(content, eq(content.id, linkResource))
          .innerJoin(cat, and(eq(cat.id, linkCategory), categoryTenantScope(cat.organizationId, organizationId)))
          .where(and(...conditions(without)))
          .groupBy(linkCategory);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    }),
  };
}

// ─── Registre (un stockage par type de ressource, comme core/locks) ─────────
const registry = new Map<string, CategoryTaxonomy>();

/** Enregistre la taxonomie d'un module (refus d'un doublon : un seul stockage par ressource). */
export function registerCategoryTaxonomy(taxonomy: CategoryTaxonomy): CategoryTaxonomy {
  const existing = registry.get(taxonomy.resourceType);
  if (existing && existing !== taxonomy) throw new Error(`Category taxonomy already registered: ${taxonomy.resourceType}`);
  registry.set(taxonomy.resourceType, taxonomy);
  return taxonomy;
}

/** Taxonomie d'un type de ressource — `undefined` si le module n'adhère pas (aucun repli). */
export const categoryTaxonomyFor = (resourceType: string): CategoryTaxonomy | undefined => registry.get(resourceType);
export const registeredCategoryTaxonomies = (): readonly string[] => [...registry.keys()].sort();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Valeur d'URL → identifiant de catégorie (uuid) ou `undefined` (valeur ignorée, jamais envoyée en SQL). */
export const categoryFilterFromUrl = (value: unknown): string | undefined =>
  typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : undefined;
