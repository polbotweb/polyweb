import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { getDrizzle } from "@database/drizzle";
import { fail } from "@/lib/effect/failure";
import { dbTry } from "@/lib/effect/run";
import { classifiedFavorites, classifiedSavedSearchFilters, classifiedSavedSearches } from "../schema";
import { adAccess, classifiedRateLimit, requireUser, type ClassifiedViewer } from "./access";
import type { ClassifiedCondition, ClassifiedKind } from "../domain/workflow";

export const toggleFavorite = (adId: string, viewer: ClassifiedViewer) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    yield* classifiedRateLimit(actor.id, "favorite");
    yield* adAccess(adId, actor);
    const db = getDrizzle();
    const existing = yield* dbTry("classifieds.favorite.get", () =>
      db.select({ adId: classifiedFavorites.adId }).from(classifiedFavorites).where(and(eq(classifiedFavorites.adId, adId), eq(classifiedFavorites.userId, actor.id))).limit(1),
    );
    if (existing[0]) {
      yield* dbTry("classifieds.favorite.delete", () => db.delete(classifiedFavorites).where(and(eq(classifiedFavorites.adId, adId), eq(classifiedFavorites.userId, actor.id))));
      return { favorite: false };
    }
    yield* dbTry("classifieds.favorite.insert", () => db.insert(classifiedFavorites).values({ adId, userId: actor.id }));
    return { favorite: true };
  });

export interface SavedSearchInput {
  readonly name?: string | null;
  readonly query?: string | null;
  readonly categoryId?: string | null;
  readonly kind?: ClassifiedKind | null;
  readonly condition?: ClassifiedCondition | null;
  readonly priceMinMinor?: number | null;
  readonly priceMaxMinor?: number | null;
  readonly currency?: string | null;
  readonly city?: string | null;
  readonly postalCode?: string | null;
  readonly notify?: boolean;
  readonly filters?: readonly { definitionKey: string; textValue?: string | null; numberMin?: number | null; numberMax?: number | null; booleanValue?: boolean | null; optionKey?: string | null }[];
}

export const saveSearch = (siteId: string, viewer: ClassifiedViewer, input: SavedSearchInput) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    yield* classifiedRateLimit(actor.id, "savedSearch");
    const [row] = yield* dbTry("classifieds.saved.insert", () =>
      getDrizzle().insert(classifiedSavedSearches).values({
        userId: actor.id, siteId, name: input.name?.trim().slice(0, 120) || null, query: input.query?.trim().slice(0, 200) || null,
        categoryId: input.categoryId ?? null, kind: input.kind ?? null, condition: input.condition ?? null,
        priceMinMinor: input.priceMinMinor ?? null, priceMaxMinor: input.priceMaxMinor ?? null, currency: input.currency ?? null,
        city: input.city?.trim().slice(0, 120) || null, postalCode: input.postalCode?.trim().slice(0, 20) || null, notify: input.notify ?? true,
      }).returning({ id: classifiedSavedSearches.id }),
    );
    if (input.filters?.length) {
      yield* dbTry("classifieds.saved.filters", () =>
        getDrizzle().insert(classifiedSavedSearchFilters).values(input.filters!.map((f) => ({
          searchId: row.id, definitionKey: f.definitionKey, textValue: f.textValue ?? null, numberMin: f.numberMin ?? null, numberMax: f.numberMax ?? null, booleanValue: f.booleanValue ?? null, optionKey: f.optionKey ?? null,
        }))),
      );
    }
    return row;
  });

export const deleteSavedSearch = (id: string, viewer: ClassifiedViewer) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    const deleted = yield* dbTry("classifieds.saved.delete", () =>
      getDrizzle().delete(classifiedSavedSearches).where(and(eq(classifiedSavedSearches.id, id), eq(classifiedSavedSearches.userId, actor.id))).returning({ id: classifiedSavedSearches.id }),
    );
    if (!deleted[0]) return yield* fail("NOT_FOUND", "Élément introuvable.");
    return { ok: true };
  });

export const setSavedSearchNotify = (id: string, viewer: ClassifiedViewer, notify: boolean) =>
  Effect.gen(function* () {
    const actor = yield* requireUser(viewer);
    const updated = yield* dbTry("classifieds.saved.notify", () =>
      getDrizzle().update(classifiedSavedSearches).set({ notify }).where(and(eq(classifiedSavedSearches.id, id), eq(classifiedSavedSearches.userId, actor.id))).returning({ id: classifiedSavedSearches.id }),
    );
    if (!updated[0]) return yield* fail("NOT_FOUND", "Élément introuvable.");
    return { ok: true, notify };
  });
