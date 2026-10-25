/** Libellés publics du module shop (catalogue, 4 locales). */
import type { Locale } from "@i18n/config";

export type ShopTranslations = {
  meta: { title: string; description: string };
  labels: { shop: string; product: string; noResults: string; readMore: string; variants: string; sku: string; price: string; available: string; unavailable: string; back: string };
};

const translations: Record<Locale, ShopTranslations> = {
  fr: { meta: { title: "Boutique", description: "Découvrez notre catalogue." }, labels: { shop: "Boutique", product: "Produit", noResults: "Aucun produit disponible.", readMore: "Voir le produit", variants: "Déclinaisons", sku: "Réf.", price: "Prix", available: "Disponible", unavailable: "Indisponible", back: "Tous les produits" } },
  en: { meta: { title: "Shop", description: "Browse our catalog." }, labels: { shop: "Shop", product: "Product", noResults: "No products available.", readMore: "View product", variants: "Variants", sku: "SKU", price: "Price", available: "Available", unavailable: "Unavailable", back: "All products" } },
  es: { meta: { title: "Tienda", description: "Descubre nuestro catálogo." }, labels: { shop: "Tienda", product: "Producto", noResults: "No hay productos disponibles.", readMore: "Ver producto", variants: "Variantes", sku: "Ref.", price: "Precio", available: "Disponible", unavailable: "No disponible", back: "Todos los productos" } },
  ar: { meta: { title: "المتجر", description: "تصفح كتالوجنا." }, labels: { shop: "المتجر", product: "منتج", noResults: "لا توجد منتجات متاحة.", readMore: "عرض المنتج", variants: "الخيارات", sku: "المرجع", price: "السعر", available: "متوفر", unavailable: "غير متوفر", back: "كل المنتجات" } },
};

export function getShopTranslations(locale: Locale): ShopTranslations {
  return translations[locale];
}
