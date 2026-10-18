/** Libellés génériques de la barre d'actions groupées (fr/en/es/ar). `{count}` est remplacé côté client. */
import type { Locale } from "@i18n/config";

export interface BulkUiTranslations {
  readonly region: string;
  readonly selected: string;
  readonly none: string;
  readonly selectPage: string;
  readonly selectRow: string;
  readonly clear: string;
  readonly confirmTitle: string;
  readonly confirmMessage: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly success: string;
  readonly error: string;
  readonly limit: string;
}

const BULK_UI: Record<Locale, BulkUiTranslations> = {
  fr: { region: "Actions groupées", selected: "{count} élément(s) sélectionné(s)", none: "Aucun élément sélectionné", selectPage: "Sélectionner tous les éléments de la page", selectRow: "Sélectionner « {title} »", clear: "Vider la sélection", confirmTitle: "Confirmer l'action groupée", confirmMessage: "« {action} » sera appliqué à {count} élément(s). Tout ou rien : si un élément est refusé, aucun n'est modifié.", confirm: "Confirmer", cancel: "Annuler", success: "{count} élément(s) mis à jour.", error: "L'action groupée a échoué. Aucun élément n'a été modifié.", limit: "Sélection limitée à {count} éléments." },
  en: { region: "Bulk actions", selected: "{count} item(s) selected", none: "No item selected", selectPage: "Select all items on this page", selectRow: "Select “{title}”", clear: "Clear selection", confirmTitle: "Confirm bulk action", confirmMessage: "“{action}” will be applied to {count} item(s). All or nothing: if one item is rejected, none is changed.", confirm: "Confirm", cancel: "Cancel", success: "{count} item(s) updated.", error: "The bulk action failed. No item was changed.", limit: "Selection limited to {count} items." },
  es: { region: "Acciones masivas", selected: "{count} elemento(s) seleccionado(s)", none: "Ningún elemento seleccionado", selectPage: "Seleccionar todos los elementos de la página", selectRow: "Seleccionar «{title}»", clear: "Vaciar la selección", confirmTitle: "Confirmar la acción masiva", confirmMessage: "«{action}» se aplicará a {count} elemento(s). Todo o nada: si se rechaza un elemento, no se modifica ninguno.", confirm: "Confirmar", cancel: "Cancelar", success: "{count} elemento(s) actualizado(s).", error: "La acción masiva ha fallado. No se ha modificado ningún elemento.", limit: "Selección limitada a {count} elementos." },
  ar: { region: "إجراءات جماعية", selected: "تم تحديد {count} عنصر", none: "لم يتم تحديد أي عنصر", selectPage: "تحديد كل عناصر هذه الصفحة", selectRow: "تحديد «{title}»", clear: "مسح التحديد", confirmTitle: "تأكيد الإجراء الجماعي", confirmMessage: "سيُطبَّق «{action}» على {count} عنصر. الكل أو لا شيء: إذا رُفض عنصر واحد فلن يتغير أي عنصر.", confirm: "تأكيد", cancel: "إلغاء", success: "تم تحديث {count} عنصر.", error: "فشل الإجراء الجماعي. لم يتغير أي عنصر.", limit: "التحديد محدود بـ {count} عنصر." },
};

export const getBulkUiTranslations = (locale: Locale): BulkUiTranslations => BULK_UI[locale] ?? BULK_UI.fr;
export const formatBulk = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => (key in values ? String(values[key]) : `{${key}}`));
