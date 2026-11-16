/**
 * Crée, une seule fois par site, les réglages, catégories et attributs seedés (idempotent, audité).
 */
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { LOCALES } from "@i18n/config";
import { getDrizzle } from "@database/drizzle";
import { attributeDefinitionTranslations, attributeDefinitions, attributeOptionTranslations, attributeOptions } from "@/core/attributes/schema";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction } from "@/lib/effect/transaction";
import { classifiedCategories, classifiedCategoryTranslations, classifiedSiteSettings } from "../schema";
import { DEFAULT_CLASSIFIED_CATEGORIES, flattenCategories, seedYearMax, type SeedAttribute } from "../domain/defaults";
import { classifiedsAudit } from "./audit";
import type { Scope } from "./access";

export const ensureSiteClassifieds = (scope: Scope, actorId: string | null = null) =>
  Effect.gen(function* () {
    const existing = yield* dbTry("classifieds.ensure.settings", () =>
      getDrizzle().select({ siteId: classifiedSiteSettings.siteId }).from(classifiedSiteSettings).where(eq(classifiedSiteSettings.siteId, scope.siteId)).limit(1),
    );
    if (existing.length > 0) return false;
    return yield* dbTransaction("classifieds.ensure", (tx) =>
      Effect.gen(function* () {
        yield* dbTry("classifieds.ensure.settings.insert", () =>
          tx.insert(classifiedSiteSettings).values({ siteId: scope.siteId, visibility: "public", preModeration: true, durationDays: 30, defaultCurrency: "EUR", maxImages: 8, maxRenewals: 3, updatedBy: actorId }),
        );
        const ids = new Map<string, string>();
        for (const { node, parentSlug, position } of flattenCategories(DEFAULT_CLASSIFIED_CATEGORIES)) {
          const [row] = yield* dbTry("classifieds.ensure.category", () =>
            tx.insert(classifiedCategories).values({
              siteId: scope.siteId, parentId: parentSlug ? ids.get(parentSlug) ?? null : null, slug: node.slug, position,
            }).returning({ id: classifiedCategories.id }),
          );
          ids.set(node.slug, row.id);
          yield* dbTry("classifieds.ensure.category.tr", () =>
            tx.insert(classifiedCategoryTranslations).values(LOCALES.map((locale) => ({ categoryId: row.id, locale, name: node.translations[locale] }))),
          );
          if (node.attributes?.length) yield* seedAttributes(tx, row.id, node.attributes);
        }
        yield* classifiedsAudit(tx, {
          actorId, action: "classifieds.board.ensure", resource: "classified_site_settings", resourceId: scope.siteId,
          organizationId: scope.organizationId, siteId: scope.siteId, metadata: { seeded: true },
        });
        return true;
      }),
    );
  });

const seedAttributes = (tx: Parameters<Parameters<typeof dbTransaction>[1]>[0], ownerId: string, attributes: readonly SeedAttribute[]) =>
  Effect.forEach(attributes, (attribute, i) =>
    Effect.gen(function* () {
      const [def] = yield* dbTry("classifieds.ensure.attribute", () =>
        tx.insert(attributeDefinitions).values({
          module: "classifieds", ownerType: "category", ownerId, key: attribute.key, kind: attribute.kind,
          required: attribute.required, filterable: attribute.filterable, unit: attribute.unit ?? null,
          minValue: attribute.minValue ?? null, maxValue: attribute.key === "annee" ? seedYearMax() : attribute.maxValue ?? null, position: i,
        }).returning({ id: attributeDefinitions.id }),
      );
      yield* dbTry("classifieds.ensure.attribute.tr", () =>
        tx.insert(attributeDefinitionTranslations).values(LOCALES.map((locale) => ({ definitionId: def.id, locale, label: attribute.labels[locale] }))),
      );
      for (const [j, option] of (attribute.options ?? []).entries()) {
        const [opt] = yield* dbTry("classifieds.ensure.option", () =>
          tx.insert(attributeOptions).values({ definitionId: def.id, key: option.key, position: j }).returning({ id: attributeOptions.id }),
        );
        yield* dbTry("classifieds.ensure.option.tr", () =>
          tx.insert(attributeOptionTranslations).values(LOCALES.map((locale) => ({ optionId: opt.id, locale, label: option.labels[locale] }))),
        );
      }
    }),
    { concurrency: 1 },
  );
