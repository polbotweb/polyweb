import type { Locale } from "@i18n/config";

export type ModuleId = "blog" | "services" | "tax" | "sales" | "crm";

const labels: Record<ModuleId, Record<Locale, string>> = {
  blog: { fr: "Blog", en: "Blog", es: "Blog", ar: "المدونة" },
  services: { fr: "Services", en: "Services", es: "Servicios", ar: "الخدمات" },
  tax: { fr: "TVA", en: "VAT", es: "IVA", ar: "ضريبة القيمة المضافة" },
  sales: { fr: "Ventes", en: "Sales", es: "Ventas", ar: "المبيعات" },
  crm: { fr: "CRM", en: "CRM", es: "CRM", ar: "إدارة العملاء" },
};

export function getModuleLabel(moduleId: ModuleId, locale: Locale): string {
  return labels[moduleId][locale];
}
