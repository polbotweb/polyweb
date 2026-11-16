/**
 * Lecture publique et compte : listes filtrées (FTS + attributs), fiches, favoris, recherches.
 */
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { mediaFiles } from "@database/schemas/media.schema";
import { user } from "@database/schemas/auth.schema";
import type { LoadedDefinition } from "@/core/attributes";
import { dbTry } from "@/lib/effect/run";
import { ADS_PAGE_SIZE, ATTRIBUTE_RESOURCE, clampPage, isPubliclyListed } from "../domain/rules";
import type { ClassifiedCondition, ClassifiedKind, ClassifiedLifecycle } from "../domain/workflow";
import { classifiedAdMedia, classifiedAds, classifiedFavorites, classifiedSavedSearchFilters, classifiedSavedSearches } from "../schema";
import { adAccess, boardAccess, notFound, requireUser, type ClassifiedViewer } from "./access";
import { ancestryIds, categoryById, descendantIds, flattenTree, type CategoryNode } from "./categories";
import { loadAdDefinitions } from "./ad.service";
import { loadValues } from "@/core/attributes";

export interface AttributeFilter {
  readonly key: string;
  readonly text?: string | null;
  readonly numberMin?: number | null;
  readonly numberMax?: number | null;
  readonly booleanValue?: boolean | null;
  readonly optionId?: string | null;
  readonly optionKey?: string | null;
}

export interface AdListQuery {
  readonly query?: string | null;
  readonly categoryId?: string | null;
  readonly kind?: ClassifiedKind | null;
  readonly condition?: ClassifiedCondition | null;
  readonly priceMinMinor?: number | null;
  readonly priceMaxMinor?: number | null;
  readonly city?: string | null;
  readonly postalCode?: string | null;
  readonly attributes?: readonly AttributeFilter[];
  readonly page?: number;
  readonly pageSize?: number;
}

export const parseListQuery = (params: URLSearchParams): AdListQuery => {
  const num = (name: string) => {
    const raw = params.get(name);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const kind = params.get("kind");
  const condition = params.get("condition");
  const attributes: AttributeFilter[] = [];
  for (const [key, value] of params.entries()) {
    if (!key.startsWith("a_") || !value) continue;
    if (key.endsWith("_min")) attributes.push({ key: key.slice(2, -4), numberMin: Number(value) });
    else if (key.endsWith("_max")) attributes.push({ key: key.slice(2, -4), numberMax: Number(value) });
    else if (value === "true" || value === "false") attributes.push({ key: key.slice(2), booleanValue: value === "true" });
    else attributes.push({ key: key.slice(2), text: value, optionKey: value });
  }
  // Fusionner min/max d'une même clé
  const merged = new Map<string, AttributeFilter>();
  for (const a of attributes) {
    const cur = merged.get(a.key) ?? { key: a.key };
    merged.set(a.key, { ...cur, ...a, key: a.key });
  }
  return {
    query: params.get("q")?.trim() || null,
    categoryId: params.get("category") || null,
    kind: kind === "offer" || kind === "wanted" ? kind : null,
    condition: condition === "new" || condition === "used" || condition === "n_a" ? condition : null,
    priceMinMinor: num("priceMin"),
    priceMaxMinor: num("priceMax"),
    city: params.get("city")?.trim() || null,
    postalCode: params.get("postal")?.trim() || null,
    attributes: [...merged.values()],
    page: Number(params.get("page") ?? 1) || 1,
  };
};

const publiclyListed = (now = new Date()) =>
  and(
    eq(classifiedAds.lifecycle, "published"),
    eq(classifiedAds.moderationStatus, "visible"),
    or(isNull(classifiedAds.expiresAt), gte(classifiedAds.expiresAt, now)),
  );

const attributeClause = (filter: AttributeFilter): SQL | undefined => {
  const key = filter.key;
  const base = sql`exists (select 1 from attribute_values av join attribute_definitions ad on ad.id = av.definition_id where av.resource_type = ${ATTRIBUTE_RESOURCE} and av.resource_id = ${classifiedAds.id} and ad.key = ${key}`;
  if (filter.numberMin != null || filter.numberMax != null) {
    const min = filter.numberMin ?? -1e15;
    const max = filter.numberMax ?? 1e15;
    return sql`${base} and av.number_value is not null and av.number_value >= ${min} and av.number_value <= ${max})`;
  }
  if (filter.booleanValue != null) {
    return sql`${base} and av.boolean_value = ${filter.booleanValue})`;
  }
  if (filter.optionId) {
    return sql`${base} and (av.option_id = ${filter.optionId} or exists (select 1 from attribute_value_options avo where avo.resource_type = ${ATTRIBUTE_RESOURCE} and avo.resource_id = ${classifiedAds.id} and avo.definition_id = ad.id and avo.option_id = ${filter.optionId})))`;
  }
  if (filter.optionKey || filter.text) {
    const raw = (filter.optionKey || filter.text || "").trim();
    if (!raw) return undefined;
    const like = `%${raw}%`;
    return sql`${base} and (av.text_value ilike ${like} or av.date_value = ${raw} or av.option_id in (select id from attribute_options where key = ${raw}) or exists (select 1 from attribute_value_options avo join attribute_options ao on ao.id = avo.option_id where avo.resource_type = ${ATTRIBUTE_RESOURCE} and avo.resource_id = ${classifiedAds.id} and avo.definition_id = ad.id and ao.key = ${raw})))`;
  }
  return undefined;
};

const listWhere = (siteId: string, input: AdListQuery, categoryIds: readonly string[] | null) => {
  const parts: SQL[] = [eq(classifiedAds.siteId, siteId), publiclyListed() as SQL];
  if (categoryIds && categoryIds.length) parts.push(inArray(classifiedAds.categoryId, [...categoryIds]));
  if (input.kind) parts.push(eq(classifiedAds.kind, input.kind));
  if (input.condition) parts.push(eq(classifiedAds.condition, input.condition));
  if (input.city) parts.push(ilike(classifiedAds.city, `%${input.city}%`));
  if (input.postalCode) parts.push(eq(classifiedAds.postalCode, input.postalCode));
  if (input.priceMinMinor != null) parts.push(gte(classifiedAds.priceMinor, input.priceMinMinor));
  if (input.priceMaxMinor != null) parts.push(lte(classifiedAds.priceMinor, input.priceMaxMinor));
  const q = input.query?.trim();
  if (q) parts.push(sql`${classifiedAds.searchVector} @@ websearch_to_tsquery('simple', ${q})`);
  for (const filter of input.attributes ?? []) {
    const clause = attributeClause(filter);
    if (clause) parts.push(clause);
  }
  return and(...parts);
};

const resolveCategoryIds = (tree: readonly CategoryNode[], categoryIdOrSlug: string | null | undefined) => {
  if (!categoryIdOrSlug) return null;
  const all = flattenTree(tree);
  const node = all.find((c) => c.id === categoryIdOrSlug || c.slug === categoryIdOrSlug);
  return node ? descendantIds(node) : [];
};

export const listPublicAds = (siteId: string, viewer: ClassifiedViewer, tree: readonly CategoryNode[], input: AdListQuery) =>
  Effect.gen(function* () {
    yield* boardAccess(siteId, viewer);
    const categoryIds = resolveCategoryIds(tree, input.categoryId);
    if (categoryIds && categoryIds.length === 0) return { items: [], total: 0, page: 1, pages: 1, pageSize: input.pageSize ?? ADS_PAGE_SIZE };
    const size = input.pageSize ?? ADS_PAGE_SIZE;
    const where = listWhere(siteId, input, categoryIds);
    const [{ total }] = yield* dbTry("classifieds.list.count", () => getDrizzle().select({ total: sql<number>`cast(count(*) as int)` }).from(classifiedAds).where(where));
    const page = clampPage(input.page ?? 1, total, size);
    const rows = yield* dbTry("classifieds.list.rows", () =>
      getDrizzle()
        .select({
          id: classifiedAds.id, slug: classifiedAds.slug, title: classifiedAds.title, kind: classifiedAds.kind, condition: classifiedAds.condition,
          priceKind: classifiedAds.priceKind, priceMinor: classifiedAds.priceMinor, currency: classifiedAds.currency, city: classifiedAds.city,
          postalCode: classifiedAds.postalCode, publishedAt: classifiedAds.publishedAt, expiresAt: classifiedAds.expiresAt, categoryId: classifiedAds.categoryId,
          coverUrl: mediaFiles.url, coverId: classifiedAds.coverImageId,
        })
        .from(classifiedAds)
        .leftJoin(mediaFiles, eq(mediaFiles.id, classifiedAds.coverImageId))
        .where(where)
        .orderBy(desc(classifiedAds.publishedAt), desc(classifiedAds.createdAt))
        .limit(size)
        .offset((page - 1) * size),
    );
    return { items: rows, total, page, pages: Math.max(1, Math.ceil(total / size)), pageSize: size };
  });

export const loadPublicAd = (siteId: string, slug: string, viewer: ClassifiedViewer, locale: string) =>
  Effect.gen(function* () {
    const [row] = yield* dbTry("classifieds.ad.bySlug", () =>
      getDrizzle().select().from(classifiedAds).where(and(eq(classifiedAds.siteId, siteId), eq(classifiedAds.slug, slug))).limit(1),
    );
    if (!row) return yield* notFound();
    const access = yield* adAccess(row.id, viewer);
    const [author] = row.authorId
      ? yield* dbTry("classifieds.ad.author", () => getDrizzle().select({ id: user.id, name: user.name }).from(user).where(eq(user.id, row.authorId!)).limit(1))
      : [null];
    const media = yield* dbTry("classifieds.ad.media", () =>
      getDrizzle().select({ mediaId: classifiedAdMedia.mediaId, altText: classifiedAdMedia.altText, position: classifiedAdMedia.position, url: mediaFiles.url })
        .from(classifiedAdMedia).innerJoin(mediaFiles, eq(mediaFiles.id, classifiedAdMedia.mediaId))
        .where(eq(classifiedAdMedia.adId, row.id)).orderBy(classifiedAdMedia.position),
    );
    const definitions = yield* loadAdDefinitions(siteId, row.categoryId);
    const values = yield* loadValues(ATTRIBUTE_RESOURCE, row.id);
    const favorite = viewer
      ? (yield* dbTry("classifieds.ad.fav", () => getDrizzle().select({ adId: classifiedFavorites.adId }).from(classifiedFavorites).where(and(eq(classifiedFavorites.adId, row.id), eq(classifiedFavorites.userId, viewer.id))).limit(1)))[0] !== undefined
      : false;
    const category = yield* categoryById(siteId, row.categoryId, locale);
    const ancestors = yield* ancestryIds(siteId, row.categoryId);
    return { ...access, author: author ?? null, media, definitions, values, favorite, category, ancestorIds: ancestors, listed: isPubliclyListed(row.lifecycle, row.moderationStatus) };
  });

export const listMine = (siteId: string, viewer: ClassifiedViewer, page = 1) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    yield* boardAccess(siteId, actor);
    const where = and(eq(classifiedAds.siteId, siteId), eq(classifiedAds.authorId, actor.id));
    const [{ total }] = yield* dbTry("classifieds.mine.count", () => getDrizzle().select({ total: sql<number>`cast(count(*) as int)` }).from(classifiedAds).where(where));
    const size = ADS_PAGE_SIZE;
    const current = clampPage(page, total, size);
    const items = yield* dbTry("classifieds.mine.rows", () =>
      getDrizzle().select().from(classifiedAds).where(where).orderBy(desc(classifiedAds.updatedAt)).limit(size).offset((current - 1) * size),
    );
    return { items, total, page: current, pages: Math.max(1, Math.ceil(total / size)) };
  });

export const listFavorites = (siteId: string, viewer: ClassifiedViewer, page = 1) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    yield* boardAccess(siteId, actor);
    const where = and(eq(classifiedFavorites.userId, actor.id), eq(classifiedAds.siteId, siteId), publiclyListed());
    const [{ total }] = yield* dbTry("classifieds.fav.count", () =>
      getDrizzle().select({ total: sql<number>`cast(count(*) as int)` }).from(classifiedFavorites).innerJoin(classifiedAds, eq(classifiedAds.id, classifiedFavorites.adId)).where(where),
    );
    const size = ADS_PAGE_SIZE;
    const current = clampPage(page, total, size);
    const items = yield* dbTry("classifieds.fav.rows", () =>
      getDrizzle().select({
        id: classifiedAds.id, slug: classifiedAds.slug, title: classifiedAds.title, kind: classifiedAds.kind,
        priceKind: classifiedAds.priceKind, priceMinor: classifiedAds.priceMinor, currency: classifiedAds.currency, city: classifiedAds.city,
        publishedAt: classifiedAds.publishedAt, coverUrl: mediaFiles.url, categoryId: classifiedAds.categoryId,
      })
        .from(classifiedFavorites)
        .innerJoin(classifiedAds, eq(classifiedAds.id, classifiedFavorites.adId))
        .leftJoin(mediaFiles, eq(mediaFiles.id, classifiedAds.coverImageId))
        .where(where)
        .orderBy(desc(classifiedFavorites.createdAt))
        .limit(size)
        .offset((current - 1) * size),
    );
    return { items, total, page: current, pages: Math.max(1, Math.ceil(total / size)) };
  });

export const listSavedSearches = (siteId: string, viewer: ClassifiedViewer) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    const rows = yield* dbTry("classifieds.saved.list", () =>
      getDrizzle().select().from(classifiedSavedSearches).where(and(eq(classifiedSavedSearches.userId, actor.id), eq(classifiedSavedSearches.siteId, siteId))).orderBy(desc(classifiedSavedSearches.createdAt)),
    );
    const filters = rows.length
      ? yield* dbTry("classifieds.saved.filters.list", () => getDrizzle().select().from(classifiedSavedSearchFilters).where(inArray(classifiedSavedSearchFilters.searchId, rows.map((r) => r.id))))
      : [];
    return rows.map((row) => ({ ...row, filters: filters.filter((f) => f.searchId === row.id) }));
  });

export const listAdminAds = (siteId: string, viewer: ClassifiedViewer, input: { lifecycle?: ClassifiedLifecycle | null; q?: string | null; page?: number }) =>
  Effect.gen(function* () {
    const access = yield* boardAccess(siteId, viewer);
    if (!access.manager) return yield* notFound();
    const parts: SQL[] = [eq(classifiedAds.siteId, siteId)];
    if (input.lifecycle) parts.push(eq(classifiedAds.lifecycle, input.lifecycle));
    if (input.q?.trim()) parts.push(sql`${classifiedAds.searchVector} @@ websearch_to_tsquery('simple', ${input.q.trim()})`);
    const where = and(...parts);
    const [{ total }] = yield* dbTry("classifieds.admin.count", () => getDrizzle().select({ total: sql<number>`cast(count(*) as int)` }).from(classifiedAds).where(where));
    const size = ADS_PAGE_SIZE;
    const page = clampPage(input.page ?? 1, total, size);
    const items = yield* dbTry("classifieds.admin.rows", () =>
      getDrizzle().select({
        id: classifiedAds.id, slug: classifiedAds.slug, title: classifiedAds.title, lifecycle: classifiedAds.lifecycle,
        moderationStatus: classifiedAds.moderationStatus, kind: classifiedAds.kind, city: classifiedAds.city,
        publishedAt: classifiedAds.publishedAt, createdAt: classifiedAds.createdAt, authorId: classifiedAds.authorId, categoryId: classifiedAds.categoryId,
      }).from(classifiedAds).where(where).orderBy(desc(classifiedAds.updatedAt)).limit(size).offset((page - 1) * size),
    );
    return { items, total, page, pages: Math.max(1, Math.ceil(total / size)) };
  });

export type { LoadedDefinition };
