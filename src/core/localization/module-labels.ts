import type { Locale } from "@i18n/config";

export type ModuleId = "blog" | "services" | "tax";

const labels: Record<ModuleId, Record<Locale, string>> = {
  blog: { fr: "Blog", en: "Blog", es: "Blog", ar: "المدونة" },
  services: { fr: "Services", en: "Services", es: "Servicios", ar: "الخدمات" },
  tax: { fr: "TVA", en: "VAT", es: "IVA", ar: "ضريبة القيمة المضافة" },
};

export function getModuleLabel(moduleId: ModuleId, locale: Locale): string {
  return labels[moduleId][locale];
}
