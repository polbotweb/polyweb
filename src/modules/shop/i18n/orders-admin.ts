/** Libellés de l'administration des commandes du Shop, 4 locales. */
import type { Locale } from "@i18n/config";

export interface OrdersAdminTranslations {
  title: string; filters: string; status: string; allStatuses: string; search: string; searchHint: string; from: string; to: string; apply: string; reset: string;
  number: string; customer: string; total: string; placedOn: string; count: string; empty: string; open: string; back: string;
  detail: string; email: string; phone: string; address: string; shipping: string; net: string; tax: string; gross: string; treatment: string;
  lines: string; sku: string; description: string; quantity: string; unitPrice: string; lineTotal: string; payment: string; paidAt: string;
  shippedAt: string; expiresAt: string; stockShortage: string; actions: string; markShipped: string; markDelivered: string; cancel: string;
  noAction: string; links: string; salesDocumentId: string; shipmentId: string; linkHint: string; saveLinks: string; done: string;
  errors: { forbidden: string; notFound: string; conflict: string; generic: string; invalidDate: string };
}

const fr: OrdersAdminTranslations = {
  title: "Commandes", filters: "Filtres", status: "Statut", allStatuses: "Tous les statuts", search: "Recherche", searchHint: "Numéro, e-mail ou nom.", from: "Du", to: "Au",
  apply: "Filtrer", reset: "Réinitialiser", number: "Numéro", customer: "Client", total: "Total TTC", placedOn: "Passée le", count: "{n} commande(s)", empty: "Aucune commande.",
  open: "Ouvrir la commande {number}", back: "Retour aux commandes", detail: "Détail", email: "E-mail", phone: "Téléphone", address: "Adresse de livraison",
  shipping: "Livraison", net: "Total HT", tax: "TVA", gross: "Total TTC", treatment: "Régime de TVA", lines: "Lignes", sku: "SKU", description: "Désignation",
  quantity: "Qté", unitPrice: "PU TTC", lineTotal: "Total TTC", payment: "Paiement", paidAt: "Payée le", shippedAt: "Expédiée le", expiresAt: "Échéance de paiement",
  stockShortage: "Rupture constatée au paiement", actions: "Actions", markShipped: "Marquer expédiée", markDelivered: "Marquer livrée", cancel: "Annuler la commande",
  noAction: "Aucune action disponible pour ce statut.", links: "Liens", salesDocumentId: "Identifiant de facture (Ventes)", shipmentId: "Identifiant d’expédition (Logistique)",
  linkHint: "Laisser vide pour délier. L’expédition liée sert au suivi : le stock est déjà sorti au paiement.", saveLinks: "Enregistrer les liens", done: "Modification enregistrée.",
  errors: { forbidden: "Vous n’avez pas les droits pour cette action.", notFound: "Élément introuvable.", conflict: "Transition impossible depuis le statut actuel.", generic: "Une erreur est survenue.", invalidDate: "Date invalide (AAAA-MM-JJ)." },
};
const en: OrdersAdminTranslations = {
  title: "Orders", filters: "Filters", status: "Status", allStatuses: "All statuses", search: "Search", searchHint: "Number, email or name.", from: "From", to: "To",
  apply: "Filter", reset: "Reset", number: "Number", customer: "Customer", total: "Total incl. VAT", placedOn: "Placed on", count: "{n} order(s)", empty: "No orders.",
  open: "Open order {number}", back: "Back to orders", detail: "Details", email: "Email", phone: "Phone", address: "Shipping address",
  shipping: "Shipping", net: "Total excl. VAT", tax: "VAT", gross: "Total incl. VAT", treatment: "VAT treatment", lines: "Lines", sku: "SKU", description: "Description",
  quantity: "Qty", unitPrice: "Unit price", lineTotal: "Total", payment: "Payment", paidAt: "Paid on", shippedAt: "Shipped on", expiresAt: "Payment deadline",
  stockShortage: "Stock shortage at payment", actions: "Actions", markShipped: "Mark as shipped", markDelivered: "Mark as delivered", cancel: "Cancel order",
  noAction: "No action available for this status.", links: "Links", salesDocumentId: "Invoice ID (Sales)", shipmentId: "Shipment ID (Logistics)",
  linkHint: "Leave empty to unlink. The linked shipment is for tracking: stock was already issued at payment.", saveLinks: "Save links", done: "Change saved.",
  errors: { forbidden: "You are not allowed to do this.", notFound: "Item not found.", conflict: "Transition not allowed from the current status.", generic: "An error occurred.", invalidDate: "Invalid date (YYYY-MM-DD)." },
};
const es: OrdersAdminTranslations = {
  title: "Pedidos", filters: "Filtros", status: "Estado", allStatuses: "Todos los estados", search: "Búsqueda", searchHint: "Número, correo o nombre.", from: "Desde", to: "Hasta",
  apply: "Filtrar", reset: "Restablecer", number: "Número", customer: "Cliente", total: "Total IVA incl.", placedOn: "Realizado el", count: "{n} pedido(s)", empty: "No hay pedidos.",
  open: "Abrir el pedido {number}", back: "Volver a los pedidos", detail: "Detalle", email: "Correo electrónico", phone: "Teléfono", address: "Dirección de envío",
  shipping: "Envío", net: "Total sin IVA", tax: "IVA", gross: "Total IVA incl.", treatment: "Régimen de IVA", lines: "Líneas", sku: "SKU", description: "Descripción",
  quantity: "Cant.", unitPrice: "Precio unitario", lineTotal: "Total", payment: "Pago", paidAt: "Pagado el", shippedAt: "Enviado el", expiresAt: "Plazo de pago",
  stockShortage: "Falta de stock al pagar", actions: "Acciones", markShipped: "Marcar como enviado", markDelivered: "Marcar como entregado", cancel: "Cancelar el pedido",
  noAction: "No hay acciones disponibles para este estado.", links: "Vínculos", salesDocumentId: "ID de factura (Ventas)", shipmentId: "ID de envío (Logística)",
  linkHint: "Déjelo vacío para desvincular. El envío vinculado sirve para el seguimiento: el stock ya salió al pagar.", saveLinks: "Guardar vínculos", done: "Cambio guardado.",
  errors: { forbidden: "No tiene permiso para esta acción.", notFound: "Elemento no encontrado.", conflict: "Transición no permitida desde el estado actual.", generic: "Se ha producido un error.", invalidDate: "Fecha no válida (AAAA-MM-DD)." },
};
const ar: OrdersAdminTranslations = {
  title: "الطلبات", filters: "عوامل التصفية", status: "الحالة", allStatuses: "كل الحالات", search: "بحث", searchHint: "الرقم أو البريد الإلكتروني أو الاسم.", from: "من", to: "إلى",
  apply: "تصفية", reset: "إعادة تعيين", number: "الرقم", customer: "العميل", total: "الإجمالي شامل الضريبة", placedOn: "تاريخ الطلب", count: "{n} طلب", empty: "لا توجد طلبات.",
  open: "فتح الطلب {number}", back: "العودة إلى الطلبات", detail: "التفاصيل", email: "البريد الإلكتروني", phone: "الهاتف", address: "عنوان الشحن",
  shipping: "الشحن", net: "الإجمالي دون ضريبة", tax: "ضريبة القيمة المضافة", gross: "الإجمالي شامل الضريبة", treatment: "نظام الضريبة", lines: "البنود", sku: "رمز المنتج", description: "الوصف",
  quantity: "الكمية", unitPrice: "سعر الوحدة", lineTotal: "الإجمالي", payment: "الدفع", paidAt: "تاريخ الدفع", shippedAt: "تاريخ الشحن", expiresAt: "مهلة الدفع",
  stockShortage: "نقص في المخزون عند الدفع", actions: "الإجراءات", markShipped: "تعيين كمشحون", markDelivered: "تعيين كمُسلَّم", cancel: "إلغاء الطلب",
  noAction: "لا يوجد إجراء متاح لهذه الحالة.", links: "الروابط", salesDocumentId: "معرّف الفاتورة (المبيعات)", shipmentId: "معرّف الشحنة (اللوجستيات)",
  linkHint: "اتركه فارغًا لإلغاء الربط. الشحنة المرتبطة للتتبع فقط: تم إخراج المخزون عند الدفع.", saveLinks: "حفظ الروابط", done: "تم حفظ التعديل.",
  errors: { forbidden: "ليست لديك صلاحية لهذا الإجراء.", notFound: "العنصر غير موجود.", conflict: "الانتقال غير مسموح من الحالة الحالية.", generic: "حدث خطأ.", invalidDate: "تاريخ غير صالح (YYYY-MM-DD)." },
};

const translations: Record<Locale, OrdersAdminTranslations> = { fr, en, es, ar };
export const getOrdersAdminTranslations = (locale: Locale): OrdersAdminTranslations => translations[locale] ?? fr;
