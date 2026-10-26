/**
 * Lecture du domaine shop.
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * `services/`). Chaque lecture est un Effect (`dbTry` → DbError typé) ;
 * `loadShop` en est l'adaptateur Promise pour les pages Astro. Les composants
 * reçoivent des DTO, jamais des lignes brutes.
 */
import { Effect } from "effect";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import type { Locale } from "@i18n/config";
import { productOptions, productOptionTranslations, productOptionValues, productOptionValueTranslations, productTranslations, productVariantOptionValues, productVariants, products } from "../schema";

/** DTO public du domaine. */
export interface ShopDTO {
  id: string;
  slug: string;
  title: string;
  status: string;
}

/** DTO public localisé (page détail / cartes). */
export interface ProductPublicDTO {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImageId: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** Option localisée d'un produit et ses valeurs ordonnées. */
export interface ProductOptionDTO {
  id: string;
  code: string;
  name: string;
  values: { id: string; code: string; label: string }[];
}

/** Variante du catalogue (prix et disponibilité éditoriale ; pas de stock). */
export interface ProductVariantDTO {
  id: string;
  sku: string;
  priceMinor: number;
  currency: string;
  available: boolean;
  valueIds: string[];
}

const publicColumns = {
  id: products.id,
  slug: productTranslations.slug,
  title: productTranslations.title,
  excerpt: productTranslations.excerpt,
  content: productTranslations.content,
  coverImageId: products.coverImageId,
  metaTitle: productTranslations.metaTitle,
  metaDescription: productTranslations.metaDescription,
};

/**
 * Portée tenant EXPLICITE : `organizationId` null = contenu global, jamais de
 * repli silencieux d'une organisation vers le global (TODO §21).
 */
const tenantScope = (organizationId: string | null) =>
  organizationId ? eq(products.organizationId, organizationId) : isNull(products.organizationId);

export const shopLoader = {
  /** Élément publié par slug localisé (relationnel, sans repli de locale). */
  publishedBySlug: (locale: Locale, slug: string, organizationId: string | null) =>
    dbTry("shop.publishedBySlug", () =>
      getDrizzle()
        .select(publicColumns)
        .from(productTranslations)
        .innerJoin(products, eq(products.id, productTranslations.productId))
        .where(and(
          eq(productTranslations.locale, locale),
          eq(productTranslations.slug, slug),
          eq(products.status, "PUBLISHED"),
          tenantScope(organizationId),
        ))
        .limit(1),
    ).pipe(Effect.map((rows): ProductPublicDTO | null => rows[0] ?? null)),
  /** Éléments publiés d'une locale. */
  listPublished: (locale: Locale, organizationId: string | null, limit = 50) =>
    dbTry("shop.listPublished", () =>
      getDrizzle()
        .select(publicColumns)
        .from(productTranslations)
        .innerJoin(products, eq(products.id, productTranslations.productId))
        .where(and(
          eq(productTranslations.locale, locale),
          eq(products.status, "PUBLISHED"),
          tenantScope(organizationId),
        ))
        .orderBy(asc(products.title))
        .limit(limit),
    ).pipe(Effect.map((rows): ProductPublicDTO[] => rows)),
  /**
   * Options localisées (une option ou valeur non traduite est omise, sans repli
   * de locale).
   */
  options: (productId: string, locale: Locale) =>
    Effect.gen(function* () {
      const opts = yield* dbTry("shop.options", () =>
        getDrizzle()
          .select({ id: productOptions.id, code: productOptions.code, name: productOptionTranslations.name })
          .from(productOptions)
          .innerJoin(productOptionTranslations, and(eq(productOptionTranslations.optionId, productOptions.id), eq(productOptionTranslations.locale, locale)))
          .where(eq(productOptions.productId, productId))
          .orderBy(asc(productOptions.position)),
      );
      if (opts.length === 0) return [] as ProductOptionDTO[];
      const values = yield* dbTry("shop.optionValues", () =>
        getDrizzle()
          .select({ id: productOptionValues.id, optionId: productOptionValues.optionId, code: productOptionValues.code, label: productOptionValueTranslations.label })
          .from(productOptionValues)
          .innerJoin(productOptionValueTranslations, and(eq(productOptionValueTranslations.valueId, productOptionValues.id), eq(productOptionValueTranslations.locale, locale)))
          .where(inArray(productOptionValues.optionId, opts.map((o) => o.id)))
          .orderBy(asc(productOptionValues.position)),
      );
      return opts.map((o): ProductOptionDTO => ({
        ...o,
        values: values.filter((v) => v.optionId === o.id).map(({ id, code, label }) => ({ id, code, label })),
      }));
    }),
  /** Variantes ordonnées d'un produit, avec leurs valeurs d'option. */
  variants: (productId: string) =>
    Effect.gen(function* () {
      const rows = yield* dbTry("shop.variants", () =>
        getDrizzle()
          .select({ id: productVariants.id, sku: productVariants.sku, priceMinor: productVariants.priceMinor, currency: productVariants.currency, available: productVariants.available })
          .from(productVariants)
          .where(eq(productVariants.productId, productId))
          .orderBy(asc(productVariants.position)),
      );
      if (rows.length === 0) return [] as ProductVariantDTO[];
      const links = yield* dbTry("shop.variantValues", () =>
        getDrizzle()
          .select({ variantId: productVariantOptionValues.variantId, valueId: productVariantOptionValues.valueId })
          .from(productVariantOptionValues)
          .where(inArray(productVariantOptionValues.variantId, rows.map((r) => r.id))),
      );
      return rows.map((r): ProductVariantDTO => ({ ...r, valueIds: links.filter((l) => l.variantId === r.id).map((l) => l.valueId) }));
    }),
  /**
   * @param viewerId lecteur connecté, ou null pour un visiteur anonyme : un
   *   visiteur ne voit que le publié. Les données dépendant de la session ne
   *   doivent pas passer par un cache public.
   */
  byId: (id: string, viewerId: string | null) =>
    dbTry("shop.byId", () =>
      getDrizzle()
        .select({ id: products.id, slug: products.slug, title: products.title, status: products.status })
        .from(products)
        .where(viewerId ? eq(products.id, id) : and(eq(products.id, id), eq(products.status, "PUBLISHED")))
        .limit(1),
    ).pipe(Effect.map((rows): ShopDTO | null => rows[0] ?? null)),
};

/** Adaptateur Promise (pages Astro). */
export const loadShop = (id: string, viewerId: string | null): Promise<ShopDTO | null> =>
  runOrThrow(shopLoader.byId(id, viewerId));

/** Adaptateurs Promise des lectures publiques. */
export const loadPublishedProductBySlug = (locale: Locale, slug: string, organizationId: string | null = null) =>
  runOrThrow(shopLoader.publishedBySlug(locale, slug, organizationId));
export const loadPublishedProducts = (locale: Locale, organizationId: string | null = null, limit?: number) =>
  runOrThrow(shopLoader.listPublished(locale, organizationId, limit));
export const loadProductOptions = (productId: string, locale: Locale) =>
  runOrThrow(shopLoader.options(productId, locale));
export const loadProductVariants = (productId: string) =>
  runOrThrow(shopLoader.variants(productId));
