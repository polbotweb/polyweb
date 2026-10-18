/** Libellés génériques des facettes et vues enregistrées (fr/en/es/ar). */
import type { Locale } from "@i18n/config";

export interface FilterUiTranslations {
  readonly facets: string;
  readonly results: string;
  readonly active: string;
  readonly clearAll: string;
  readonly savedViews: string;
  readonly noSavedViews: string;
  readonly saveView: string;
  readonly viewName: string;
  readonly save: string;
  readonly deleteView: string;
  readonly confirmDeleteTitle: string;
  readonly confirmDelete: string;
  readonly cancel: string;
  readonly confirm: string;
  readonly saved: string;
  readonly deleted: string;
  readonly error: string;
  readonly yes: string;
  readonly no: string;
}

const T: Record<Locale, FilterUiTranslations> = {
  fr: { facets: "Affiner", results: "{count} résultat(s)", active: "filtre actif", clearAll: "Effacer les filtres", savedViews: "Vues enregistrées", noSavedViews: "Aucune vue enregistrée.", saveView: "Enregistrer la vue actuelle", viewName: "Nom de la vue", save: "Enregistrer", deleteView: "Supprimer la vue « {name} »", confirmDeleteTitle: "Supprimer la vue", confirmDelete: "La vue « {name} » sera supprimée. Les éléments ne sont pas modifiés.", cancel: "Annuler", confirm: "Supprimer", saved: "Vue enregistrée.", deleted: "Vue supprimée.", error: "L'opération a échoué.", yes: "Oui", no: "Non" },
  en: { facets: "Refine", results: "{count} result(s)", active: "active filter", clearAll: "Clear filters", savedViews: "Saved views", noSavedViews: "No saved view.", saveView: "Save current view", viewName: "View name", save: "Save", deleteView: "Delete view “{name}”", confirmDeleteTitle: "Delete view", confirmDelete: "The view “{name}” will be deleted. Items are not changed.", cancel: "Cancel", confirm: "Delete", saved: "View saved.", deleted: "View deleted.", error: "The operation failed.", yes: "Yes", no: "No" },
  es: { facets: "Refinar", results: "{count} resultado(s)", active: "filtro activo", clearAll: "Borrar filtros", savedViews: "Vistas guardadas", noSavedViews: "Ninguna vista guardada.", saveView: "Guardar la vista actual", viewName: "Nombre de la vista", save: "Guardar", deleteView: "Eliminar la vista «{name}»", confirmDeleteTitle: "Eliminar la vista", confirmDelete: "La vista «{name}» se eliminará. Los elementos no se modifican.", cancel: "Cancelar", confirm: "Eliminar", saved: "Vista guardada.", deleted: "Vista eliminada.", error: "La operación ha fallado.", yes: "Sí", no: "No" },
  ar: { facets: "تحسين النتائج", results: "{count} نتيجة", active: "مرشح نشط", clearAll: "مسح المرشحات", savedViews: "العروض المحفوظة", noSavedViews: "لا توجد عروض محفوظة.", saveView: "حفظ العرض الحالي", viewName: "اسم العرض", save: "حفظ", deleteView: "حذف العرض «{name}»", confirmDeleteTitle: "حذف العرض", confirmDelete: "سيُحذف العرض «{name}». لن تتغير العناصر.", cancel: "إلغاء", confirm: "حذف", saved: "تم حفظ العرض.", deleted: "تم حذف العرض.", error: "فشلت العملية.", yes: "نعم", no: "لا" },
};

export const getFilterUiTranslations = (locale: Locale): FilterUiTranslations => T[locale] ?? T.fr;
