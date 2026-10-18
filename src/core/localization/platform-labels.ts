import type { Locale } from "@i18n/config";

/** Libellés des écrans « Plateforme » ajoutés par Polyweb (4 locales). */
export const PLATFORM_SECTIONS = ["content-types", "content", "forms", "api-tokens", "webhooks", "plugins", "sites", "payments", "crud"] as const;
export type PlatformSection = (typeof PLATFORM_SECTIONS)[number];

const labels: Record<PlatformSection | "group", Record<Locale, string>> = {
  group: { fr: "Plateforme", en: "Platform", es: "Plataforma", ar: "المنصة" },
  "content-types": { fr: "Types de contenu", en: "Content types", es: "Tipos de contenido", ar: "أنواع المحتوى" },
  content: { fr: "Contenus", en: "Content", es: "Contenidos", ar: "المحتويات" },
  forms: { fr: "Formulaires", en: "Forms", es: "Formularios", ar: "النماذج" },
  "api-tokens": { fr: "Jetons d'API", en: "API tokens", es: "Tokens de API", ar: "رموز API" },
  webhooks: { fr: "Webhooks", en: "Webhooks", es: "Webhooks", ar: "خطافات الويب" },
  plugins: { fr: "Plugins", en: "Plugins", es: "Plugins", ar: "الإضافات" },
  sites: { fr: "Sites", en: "Sites", es: "Sitios", ar: "المواقع" },
  payments: { fr: "Paiements", en: "Payments", es: "Pagos", ar: "المدفوعات" },
  crud: { fr: "Données (CRUD)", en: "Data (CRUD)", es: "Datos (CRUD)", ar: "البيانات" },
};

export function getPlatformLabel(section: PlatformSection | "group", locale: Locale): string {
  return labels[section][locale] ?? labels[section].fr;
}

export function getPlatformAdminUrl(locale: Locale, section: PlatformSection, ...rest: string[]): string {
  return [`/${locale}/admin/platform/${section}`, ...rest.map(encodeURIComponent)].join("/");
}
