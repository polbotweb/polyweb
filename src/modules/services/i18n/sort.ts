import type { Locale } from "@i18n/config";

export type ServiceSortKey = "createdAt" | "updatedAt" | "publishedAt" | "title" | "priceMinor" | "ratingAverage100" | "viewCount";
export type ServiceSortTranslations = Record<ServiceSortKey, string> & { label: string };

const translations: Record<Locale, ServiceSortTranslations> = {
  fr: { label: "Trier", createdAt: "Création", updatedAt: "Modification", publishedAt: "Publication", title: "Titre", priceMinor: "Prix", ratingAverage100: "Note", viewCount: "Vues" },
  en: { label: "Sort", createdAt: "Created", updatedAt: "Updated", publishedAt: "Published", title: "Title", priceMinor: "Price", ratingAverage100: "Rating", viewCount: "Views" },
  es: { label: "Ordenar", createdAt: "Creación", updatedAt: "Modificación", publishedAt: "Publicación", title: "Título", priceMinor: "Precio", ratingAverage100: "Valoración", viewCount: "Vistas" },
  ar: { label: "ترتيب", createdAt: "الإنشاء", updatedAt: "التعديل", publishedAt: "النشر", title: "العنوان", priceMinor: "السعر", ratingAverage100: "التقييم", viewCount: "المشاهدات" },
};

export function getServiceSortTranslations(locale: Locale): ServiceSortTranslations { return translations[locale] ?? translations.fr; }
