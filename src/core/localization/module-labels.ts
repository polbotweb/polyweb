import type { Locale } from "@i18n/config";

export type ModuleId = "blog" | "services" | "tax" | "sales" | "crm" | "logistics" | "purchasing" | "subscriptions" | "bookings" | "events" | "formations" | "courses" | "shop";

const labels: Record<ModuleId, Record<Locale, string>> = {
  blog: { fr: "Blog", en: "Blog", es: "Blog", ar: "المدونة" },
  services: { fr: "Services", en: "Services", es: "Servicios", ar: "الخدمات" },
  tax: { fr: "TVA", en: "VAT", es: "IVA", ar: "ضريبة القيمة المضافة" },
  sales: { fr: "Ventes", en: "Sales", es: "Ventas", ar: "المبيعات" },
  crm: { fr: "CRM", en: "CRM", es: "CRM", ar: "إدارة العملاء" },
  logistics: { fr: "Logistique", en: "Logistics", es: "Logística", ar: "الخدمات اللوجستية" },
  purchasing: { fr: "Achats", en: "Purchasing", es: "Compras", ar: "المشتريات" },
  subscriptions: { fr: "Abonnements", en: "Subscriptions", es: "Suscripciones", ar: "الاشتراكات" },
  bookings: { fr: "Réservations", en: "Bookings", es: "Reservas", ar: "الحجوزات" },
  events: { fr: "Événements", en: "Events", es: "Eventos", ar: "الفعاليات" },
  formations: { fr: "Formations", en: "Training", es: "Formaciones", ar: "التدريب" },
  courses: { fr: "Cours", en: "Courses", es: "Cursos", ar: "الدورات" },
  shop: { fr: "Boutique", en: "Shop", es: "Tienda", ar: "المتجر" },
};

export const isModuleId = (value: string): value is ModuleId => Object.hasOwn(labels, value);

export function getModuleLabel(moduleId: ModuleId, locale: Locale): string {
  return labels[moduleId][locale];
}
