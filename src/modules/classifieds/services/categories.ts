import { and, asc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import type { Locale } from "@i18n/config";
import { LOCALES } from "@i18n/config";
import { getDrizzle } from "@database/drizzle";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { classifiedAds, classifiedCategories, classifiedCategoryTranslations } from "../schema";
import { classifiedsAudit } from "./audit";
import type { Scope } from "./access";

export interface CategoryNode {
  readonly id: string;
  readonly siteId: string;
  readonly parentId: string | null;
  readonly slug: string;
  readonly position: number;
  readonly name: string;
  readonly descriptions: Partial<Record<Locale, string>>;
  readonly names: Record<Locale, string>;
  readonly leaf: boolean;
  readonly children: CategoryNode[];
}

export const listCategoryRows = (siteId: string) =>
  dbTry("classifieds.categories.list", () =>
    getDrizzle().select().from(classifiedCategories).where(eq(classifiedCategories.siteId, siteId)).orderBy(asc(classifiedCategories.position), asc(classifiedCategories.slug)),
  );

export const listCategoryTranslations = (categoryIds: readonly string[]) =>
  categoryIds.length === 0 ? Effect.succeed([]) : dbTry("classifieds.categories.tr", () =>
    getDrizzle().select().from(classifiedCategoryTranslations).where(inArray(classifiedCategoryTranslations.categoryId, [...categoryIds])),
  );

export const categoryTree = (siteId: string, locale: string) =>
  Effect.gen(function* () {
    const rows = yield* listCategoryRows(siteId);
    const tr = yield* listCategoryTranslations(rows.map((r) => r.id));
    const names = new Map<string, Record<Locale, string>>();
    const descriptions = new Map<string, Partial<Record<Locale, string>>>();
    for (const row of tr) {
      const bag = names.get(row.categoryId) ?? { fr: "", en: "", es: "", ar: "" };
      bag[row.locale] = row.name;
      names.set(row.categoryId, bag);
      if (row.description) {
        const d = descriptions.get(row.categoryId) ?? {};
        d[row.locale] = row.description;
        descriptions.set(row.categoryId, d);
      }
    }
    const loc = (LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : "fr";
    const nodes = new Map<string, CategoryNode>();
    for (const row of rows) {
      const n = names.get(row.id) ?? { fr: row.slug, en: row.slug, es: row.slug, ar: row.slug };
      nodes.set(row.id, { id: row.id, siteId: row.siteId, parentId: row.parentId, slug: row.slug, position: row.position, name: n[loc] || n.fr || row.slug, names: n, descriptions: descriptions.get(row.id) ?? {}, leaf: true, children: [] });
    }
    const roots: CategoryNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        const parent = nodes.get(node.parentId)!;
        parent.children.push(node);
        (parent as { leaf: boolean }).leaf = false;
      } else roots.push(node);
    }
    const sort = (list: CategoryNode[]) => { list.sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug)); list.forEach((c) => sort(c.children)); };
    sort(roots);
    return roots;
  });

export const flattenTree = (nodes: readonly CategoryNode[]): CategoryNode[] =>
  nodes.flatMap((n) => [n, ...flattenTree(n.children)]);

export const categoryBySlug = (siteId: string, slug: string, locale: string) =>
  categoryTree(siteId, locale).pipe(Effect.map((tree) => flattenTree(tree).find((c) => c.slug === slug) ?? null));

export const categoryById = (siteId: string, id: string, locale: string) =>
  categoryTree(siteId, locale).pipe(Effect.map((tree) => flattenTree(tree).find((c) => c.id === id) ?? null));

/** Identifiants de la racine vers la feuille (feuille incluse), pour l'héritage d'attributs. */
export const ancestryIds = (siteId: string, categoryId: string) =>
  Effect.gen(function* () {
    const rows = yield* listCategoryRows(siteId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const chain: string[] = [];
    let current = byId.get(categoryId);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.push(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain.reverse();
  });

export const assertLeafCategory = (siteId: string, categoryId: string) =>
  Effect.gen(function* () {
    const node = yield* categoryById(siteId, categoryId, "fr");
    if (!node || node.siteId !== siteId) return yield* fail("BAD_REQUEST", "Catégorie invalide.");
    if (!node.leaf) return yield* fail("BAD_REQUEST", "Choisissez une sous-catégorie.");
    return node;
  });

export const descendantIds = (node: CategoryNode): string[] => [node.id, ...node.children.flatMap(descendantIds)];

export const updateCategoryTranslations = (scope: Scope, actorId: string, categoryId: string, translations: Record<Locale, { name: string; description?: string }>) =>
  dbTransaction("classifieds.category.update", (tx) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("classifieds.category.get", () => tx.select().from(classifiedCategories).where(and(eq(classifiedCategories.id, categoryId), eq(classifiedCategories.siteId, scope.siteId))).limit(1));
      if (!row) return yield* fail("NOT_FOUND", "Élément introuvable.");
      yield* dbTry("classifieds.category.tr.clear", () => tx.delete(classifiedCategoryTranslations).where(eq(classifiedCategoryTranslations.categoryId, categoryId)));
      yield* dbTry("classifieds.category.tr.insert", () =>
        tx.insert(classifiedCategoryTranslations).values(LOCALES.map((locale) => ({ categoryId, locale, name: translations[locale]?.name.trim() || row.slug, description: translations[locale]?.description ?? null }))),
      );
      yield* classifiedsAudit(tx, { actorId, action: "classifieds.category.update", resource: "classified_categories", resourceId: categoryId, organizationId: scope.organizationId, siteId: scope.siteId, metadata: { slug: row.slug } });
      return row;
    }),
  );

export const reassignAndRemoveCategory = (scope: Scope, actorId: string, categoryId: string, moveToId: string) =>
  dbTransaction("classifieds.category.remove", (tx) =>
    Effect.gen(function* () {
      if (categoryId === moveToId) return yield* fail("BAD_REQUEST", "Catégorie de destination invalide.");
      const [from] = yield* dbTry("classifieds.category.from", () => tx.select().from(classifiedCategories).where(and(eq(classifiedCategories.id, categoryId), eq(classifiedCategories.siteId, scope.siteId))).limit(1));
      const [to] = yield* dbTry("classifieds.category.to", () => tx.select().from(classifiedCategories).where(and(eq(classifiedCategories.id, moveToId), eq(classifiedCategories.siteId, scope.siteId))).limit(1));
      if (!from || !to) return yield* fail("NOT_FOUND", "Élément introuvable.");
      const children = yield* dbTry("classifieds.category.children", () => tx.select({ id: classifiedCategories.id }).from(classifiedCategories).where(eq(classifiedCategories.parentId, categoryId)).limit(1));
      if (children.length) return yield* fail("CONFLICT", "Déplacez ou supprimez d'abord les sous-catégories.");
      yield* dbTry("classifieds.category.reassign", () => tx.update(classifiedAds).set({ categoryId: moveToId }).where(eq(classifiedAds.categoryId, categoryId)));
      yield* dbTry("classifieds.category.delete", () => tx.delete(classifiedCategories).where(eq(classifiedCategories.id, categoryId)));
      yield* classifiedsAudit(tx, { actorId, action: "classifieds.category.delete", resource: "classified_categories", resourceId: categoryId, organizationId: scope.organizationId, siteId: scope.siteId, metadata: { slug: from.slug, moveTo: to.slug } });
      return true;
    }),
  );
