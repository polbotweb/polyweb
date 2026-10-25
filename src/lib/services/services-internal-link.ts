import { and, eq, ilike, isNull } from "drizzle-orm";
import type { Locale } from "@i18n/config";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDrizzle } from "@database/drizzle";
import { organization, serviceCategoryLinks, serviceCategories, serviceTranslations, services } from "@database/schemas";
import { getServiceBySlug } from "@/modules/services/loaders";
import { buildServiceUrl } from "@/modules/services/utils";
import type { InternalLinkResolver } from "@/lib/content/internal-link-resolver";
import { Effect } from "effect";
import { dbTry, runOrThrow } from "@/lib/effect/run";

interface Context { locale: string; organizationId?: string | null; limit?: number }

const organizationRouteSegment = (organizationId: string | null) =>
  organizationId
    ? dbTry("services-link.orgSegment", () => getDrizzle().select({ slug: organization.slug }).from(organization).where(eq(organization.id, organizationId)).limit(1)).pipe(Effect.map(([row]) => row?.slug ?? null))
    : Effect.succeed(null);

function tenantScope(column: AnyPgColumn<{ data: string | null }>, organizationId: string | null) { return organizationId === null ? isNull(column) : eq(column, organizationId); }
function translationTenantScope(column: AnyPgColumn<{ data: string | null }>, organizationId: string | null) { return organizationId === null ? isNull(column) : eq(column, organizationId); }

/**
 * Résolveur de liens internes services — implémentation Effect (`DbError` typé).
 * `serviceInternalLinkResolver` reste l'adaptateur Promise du contrat ouvert
 * `InternalLinkResolver` (`runOrThrow` relève la cause d'origine).
 */
export const serviceInternalLinkEffects = {
  resolve: (target: string, ctx: Context) =>
    Effect.gen(function* () {
      const locale = ctx.locale as Locale; const organizationId = ctx.organizationId ?? null;
      const service = yield* dbTry("services-link.resolve", () => getServiceBySlug(target, locale, organizationId));
      if (!service?.translation) return { href: "#", title: null, exists: false };
      const orgSegment = yield* organizationRouteSegment(organizationId);
      return { href: buildServiceUrl(locale, orgSegment, service.translation.slug, service.categories[0]?.slug ?? null), title: service.translation.title, exists: true };
    }),
  listValidTargets: (ctx: Context) => {
    const organizationId = ctx.organizationId ?? null;
    return dbTry("services-link.listValidTargets", () => getDrizzle().select({ slug: serviceTranslations.slug }).from(serviceTranslations).innerJoin(services, eq(services.id, serviceTranslations.serviceId)).where(and(eq(serviceTranslations.locale, ctx.locale as Locale), eq(services.status, "PUBLISHED"), tenantScope(services.organizationId, organizationId), translationTenantScope(serviceTranslations.organizationId, organizationId)))).pipe(
      Effect.map((rows) => new Set(rows.map((row) => row.slug))),
    );
  },
  search: (query: string, ctx: Context) =>
    Effect.gen(function* () {
      const organizationId = ctx.organizationId ?? null;
      const rows = yield* dbTry("services-link.search", () => getDrizzle().select({ id: services.id, slug: serviceTranslations.slug, title: serviceTranslations.title, categorySlug: serviceCategories.slug }).from(serviceTranslations).innerJoin(services, eq(services.id, serviceTranslations.serviceId)).leftJoin(serviceCategoryLinks, eq(serviceCategoryLinks.serviceId, services.id)).leftJoin(serviceCategories, and(eq(serviceCategories.id, serviceCategoryLinks.categoryId), tenantScope(serviceCategories.organizationId, organizationId))).where(and(eq(serviceTranslations.locale, ctx.locale as Locale), eq(services.status, "PUBLISHED"), ilike(serviceTranslations.title, `%${query}%`), tenantScope(services.organizationId, organizationId), translationTenantScope(serviceTranslations.organizationId, organizationId))).limit(Math.min(20, Math.max(1, ctx.limit ?? 10))));
      const orgSegment = yield* organizationRouteSegment(organizationId);
      return rows.map((row) => ({ id: row.id, label: row.title, href: buildServiceUrl(ctx.locale as Locale, orgSegment, row.slug, row.categorySlug ?? null) }));
    }),
};

/** Adaptateur Promise enregistré dans le registre de contenu (contrat inchangé). */
export const serviceInternalLinkResolver: InternalLinkResolver = {
  name: "services",
  resolve: (target: string, ctx: Context) => runOrThrow(serviceInternalLinkEffects.resolve(target, ctx)),
  listValidTargets: (ctx: Context) => runOrThrow(serviceInternalLinkEffects.listValidTargets(ctx)),
  search: (query: string, ctx: Context) => runOrThrow(serviceInternalLinkEffects.search(query, ctx)),
};
