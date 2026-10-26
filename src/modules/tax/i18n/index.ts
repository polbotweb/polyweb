/** Libellés back-office du module tax (taux de TVA, 4 locales). */
import type { Locale } from "@i18n/config";
import type { CustomerType, TaxCategory } from "../domain/rules";
import type { TaxStatus } from "../domain/workflow";

export type TaxTranslations = {
  meta: { description: string };
  admin: {
    title: string; newRate: string; editRate: string; empty: string; back: string; edit: string; save: string; create: string; saved: string; created: string;
    defaultsNote: string; facetStatus: string; facetCountry: string; facetCategory: string; listLabel: string;
    bulk: { publish: string; unpublish: string; archive: string; restore: string };
  };
  fields: { title: string; slug: string; countryCode: string; countryHint: string; category: string; customerType: string; ratePercent: string; rateHint: string; validFrom: string; validTo: string; status: string; validity: string; always: string };
  categories: Record<TaxCategory, string>;
  customerTypes: Record<CustomerType | "all", string>;
  statuses: Record<TaxStatus, string>;
};

const translations: Record<Locale, TaxTranslations> = {
  fr: {
    meta: { description: "Taux de TVA par pays, catégorie et type de client." },
    admin: { title: "Taux de TVA", newRate: "Nouveau taux", editRate: "Modifier le taux", empty: "Aucun taux personnalisé : les taux par défaut de l'UE s'appliquent.", back: "Tous les taux", edit: "Modifier", save: "Enregistrer", create: "Créer le taux", saved: "Taux enregistré.", created: "Taux créé.", defaultsNote: "Les taux saisis ici surchargent les taux par défaut (27 États membres) pour la période de validité indiquée.", facetStatus: "Statut", facetCountry: "Pays", facetCategory: "Catégorie", listLabel: "Liste des taux de TVA", bulk: { publish: "Activer", unpublish: "Repasser en brouillon", archive: "Archiver", restore: "Restaurer" } },
    fields: { title: "Libellé", slug: "Identifiant", countryCode: "Pays (code ISO)", countryHint: "Deux lettres, ex. FR, DE.", category: "Catégorie", customerType: "Type de client", ratePercent: "Taux (%)", rateHint: "Ex. 20 ou 5,5.", validFrom: "Valide à partir du", validTo: "Valide jusqu'au (exclu)", status: "Statut", validity: "Validité", always: "Sans limite" },
    categories: { standard: "Normal", reduced: "Réduit", "reduced-2": "Réduit (2)", "super-reduced": "Super-réduit", zero: "Taux zéro", exempt: "Exonéré" },
    customerTypes: { all: "Tous", B2B: "Professionnel (B2B)", B2C: "Particulier (B2C)" },
    statuses: { DRAFT: "Brouillon", PUBLISHED: "Actif", ARCHIVED: "Archivé" },
  },
  en: {
    meta: { description: "VAT rates by country, category and customer type." },
    admin: { title: "VAT rates", newRate: "New rate", editRate: "Edit rate", empty: "No custom rates: EU default rates apply.", back: "All rates", edit: "Edit", save: "Save", create: "Create rate", saved: "Rate saved.", created: "Rate created.", defaultsNote: "Rates entered here override the default rates (27 member states) for the given validity period.", facetStatus: "Status", facetCountry: "Country", facetCategory: "Category", listLabel: "VAT rate list", bulk: { publish: "Activate", unpublish: "Back to draft", archive: "Archive", restore: "Restore" } },
    fields: { title: "Label", slug: "Identifier", countryCode: "Country (ISO code)", countryHint: "Two letters, e.g. FR, DE.", category: "Category", customerType: "Customer type", ratePercent: "Rate (%)", rateHint: "E.g. 20 or 5.5.", validFrom: "Valid from", validTo: "Valid until (exclusive)", status: "Status", validity: "Validity", always: "No limit" },
    categories: { standard: "Standard", reduced: "Reduced", "reduced-2": "Reduced (2)", "super-reduced": "Super-reduced", zero: "Zero rate", exempt: "Exempt" },
    customerTypes: { all: "All", B2B: "Business (B2B)", B2C: "Consumer (B2C)" },
    statuses: { DRAFT: "Draft", PUBLISHED: "Active", ARCHIVED: "Archived" },
  },
  es: {
    meta: { description: "Tipos de IVA por país, categoría y tipo de cliente." },
    admin: { title: "Tipos de IVA", newRate: "Nuevo tipo", editRate: "Editar tipo", empty: "Sin tipos personalizados: se aplican los tipos por defecto de la UE.", back: "Todos los tipos", edit: "Editar", save: "Guardar", create: "Crear tipo", saved: "Tipo guardado.", created: "Tipo creado.", defaultsNote: "Los tipos introducidos aquí sustituyen a los tipos por defecto (27 Estados miembros) durante el periodo de validez indicado.", facetStatus: "Estado", facetCountry: "País", facetCategory: "Categoría", listLabel: "Lista de tipos de IVA", bulk: { publish: "Activar", unpublish: "Volver a borrador", archive: "Archivar", restore: "Restaurar" } },
    fields: { title: "Nombre", slug: "Identificador", countryCode: "País (código ISO)", countryHint: "Dos letras, p. ej. FR, DE.", category: "Categoría", customerType: "Tipo de cliente", ratePercent: "Tipo (%)", rateHint: "P. ej. 21 o 5,5.", validFrom: "Válido desde", validTo: "Válido hasta (excluido)", status: "Estado", validity: "Validez", always: "Sin límite" },
    categories: { standard: "General", reduced: "Reducido", "reduced-2": "Reducido (2)", "super-reduced": "Superreducido", zero: "Tipo cero", exempt: "Exento" },
    customerTypes: { all: "Todos", B2B: "Empresa (B2B)", B2C: "Particular (B2C)" },
    statuses: { DRAFT: "Borrador", PUBLISHED: "Activo", ARCHIVED: "Archivado" },
  },
  ar: {
    meta: { description: "نسب ضريبة القيمة المضافة حسب البلد والفئة ونوع العميل." },
    admin: { title: "نسب ضريبة القيمة المضافة", newRate: "نسبة جديدة", editRate: "تعديل النسبة", empty: "لا توجد نسب مخصصة: تُطبَّق النسب الافتراضية للاتحاد الأوروبي.", back: "كل النسب", edit: "تعديل", save: "حفظ", create: "إنشاء النسبة", saved: "تم حفظ النسبة.", created: "تم إنشاء النسبة.", defaultsNote: "النسب المدخلة هنا تحل محل النسب الافتراضية (27 دولة عضوًا) خلال فترة الصلاحية المحددة.", facetStatus: "الحالة", facetCountry: "البلد", facetCategory: "الفئة", listLabel: "قائمة نسب الضريبة", bulk: { publish: "تفعيل", unpublish: "إرجاع إلى مسودة", archive: "أرشفة", restore: "استعادة" } },
    fields: { title: "التسمية", slug: "المعرّف", countryCode: "البلد (رمز ISO)", countryHint: "حرفان، مثل FR أو DE.", category: "الفئة", customerType: "نوع العميل", ratePercent: "النسبة (%)", rateHint: "مثال: 20 أو 5.5.", validFrom: "صالحة من", validTo: "صالحة حتى (غير مشمول)", status: "الحالة", validity: "الصلاحية", always: "بلا حد" },
    categories: { standard: "عادية", reduced: "مخفضة", "reduced-2": "مخفضة (2)", "super-reduced": "مخفضة جدًا", zero: "نسبة صفرية", exempt: "معفاة" },
    customerTypes: { all: "الكل", B2B: "شركة (B2B)", B2C: "فرد (B2C)" },
    statuses: { DRAFT: "مسودة", PUBLISHED: "نشطة", ARCHIVED: "مؤرشفة" },
  },
};

export function getTaxTranslations(locale: Locale): TaxTranslations {
  return translations[locale];
}
