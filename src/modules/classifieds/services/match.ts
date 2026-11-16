/**
 * Correspondance d\'une annonce publiée avec les recherches enregistrées (alertes).
 */
import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { ATTRIBUTE_RESOURCE } from "../domain/rules";
import { classifiedAds, classifiedSavedSearchFilters, classifiedSavedSearches } from "../schema";
import { attributeDefinitions, attributeValueOptions, attributeValues } from "@/core/attributes";
import { ancestryIds } from "./categories";

export const matchingSavedSearches = (adId: string) =>
  Effect.gen(function* () {
    const [ad] = yield* dbTry("classifieds.match.ad", () => getDrizzle().select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1));
    if (!ad) return [] as { searchId: string; userId: string }[];
    const ancestorIds = new Set(yield* ancestryIds(ad.siteId, ad.categoryId));
    const searches = yield* dbTry("classifieds.match.searches", () =>
      getDrizzle().select().from(classifiedSavedSearches).where(and(eq(classifiedSavedSearches.siteId, ad.siteId), eq(classifiedSavedSearches.notify, true))),
    );
    if (searches.length === 0) return [];
    const filters = yield* dbTry("classifieds.match.filters", () =>
      getDrizzle().select().from(classifiedSavedSearchFilters).where(inArray(classifiedSavedSearchFilters.searchId, searches.map((s) => s.id))),
    );
    const values = yield* dbTry("classifieds.match.values", () =>
      getDrizzle().select().from(attributeValues).where(and(eq(attributeValues.resourceType, ATTRIBUTE_RESOURCE), eq(attributeValues.resourceId, adId))),
    );
    const multi = yield* dbTry("classifieds.match.multi", () =>
      getDrizzle().select().from(attributeValueOptions).where(and(eq(attributeValueOptions.resourceType, ATTRIBUTE_RESOURCE), eq(attributeValueOptions.resourceId, adId))),
    );
    const defs = values.length
      ? yield* dbTry("classifieds.match.defs", () => getDrizzle().select({ id: attributeDefinitions.id, key: attributeDefinitions.key }).from(attributeDefinitions).where(inArray(attributeDefinitions.id, values.map((v) => v.definitionId))))
      : [];
    const keyOf = new Map(defs.map((d) => [d.id, d.key]));
    const byKey = new Map(values.map((v) => [keyOf.get(v.definitionId) ?? v.definitionId, v]));
    const optionIds = new Set([...multi.map((m) => m.optionId), ...values.map((v) => v.optionId).filter((id): id is string => Boolean(id))]);
    const matches: { searchId: string; userId: string }[] = [];
    for (const search of searches) {
      if (search.userId === ad.authorId) continue;
      if (search.categoryId && !ancestorIds.has(search.categoryId)) continue;
      if (search.kind && search.kind !== ad.kind) continue;
      if (search.condition && search.condition !== ad.condition) continue;
      if (search.city && !ad.city.toLowerCase().includes(search.city.toLowerCase())) continue;
      if (search.postalCode && search.postalCode !== ad.postalCode) continue;
      if (search.priceMinMinor != null && (ad.priceMinor == null || ad.priceMinor < search.priceMinMinor)) continue;
      if (search.priceMaxMinor != null && (ad.priceMinor == null || ad.priceMinor > search.priceMaxMinor)) continue;
      if (search.query) {
        const hay = `${ad.title} ${ad.body} ${ad.city}`.toLowerCase();
        if (!search.query.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) continue;
      }
      let ok = true;
      for (const f of filters.filter((x) => x.searchId === search.id)) {
        const val = byKey.get(f.definitionKey);
        if (f.numberMin != null || f.numberMax != null) {
          if (!val || val.numberValue == null) { ok = false; break; }
          if (f.numberMin != null && val.numberValue < f.numberMin) { ok = false; break; }
          if (f.numberMax != null && val.numberValue > f.numberMax) { ok = false; break; }
        }
        if (f.booleanValue != null && val?.booleanValue !== f.booleanValue) { ok = false; break; }
        if (f.textValue && !(val?.textValue ?? "").toLowerCase().includes(f.textValue.toLowerCase())) { ok = false; break; }
        if (f.optionKey && optionIds.size === 0 && !val) { ok = false; break; }
      }
      if (ok) matches.push({ searchId: search.id, userId: search.userId });
    }
    return matches;
  });
