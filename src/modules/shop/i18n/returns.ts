/**
 * Libellés des retours clients (RMA) : page publique de commande et administration, 4 locales.
 * Les clés de motifs, statuts et problèmes suivent `domain/returns.ts` (exhaustivité vérifiée par le typage).
 */
import type { Locale } from "@i18n/config";
import type { ReturnReason, ReturnRequestProblem, ReturnStatus } from "../domain/returns";

export type ReturnPublicNoticeKey = "requested" | "notEligible" | "rateLimited" | "generic" | ReturnRequestProblem;
export type ReturnAdminNoticeKey =
  | "approved" | "rejected" | "cancelled" | "received" | "inspected" | "closed" | "refunded" | "refundPending" | "refundFailed"
  | "conflict" | "invalid" | "forbidden" | "notFound" | "noPayment" | "unavailable" | "exceeded" | "generic";

export interface ReturnTranslations {
  readonly title: string;
  readonly intro: string;
  readonly quantityFor: string;
  readonly ordered: string;
  readonly reason: string;
  readonly note: string;
  readonly noteHint: string;
  readonly submit: string;
  readonly yours: string;
  readonly number: string;
  readonly status: string;
  readonly createdOn: string;
  readonly refundAmount: string;
  readonly nothingReturnable: string;
  readonly reasons: Record<ReturnReason, string>;
  readonly statuses: Record<ReturnStatus, string>;
  readonly notices: Record<ReturnPublicNoticeKey, string>;
  readonly admin: {
    readonly listTitle: string;
    readonly listIntro: string;
    readonly filters: string;
    readonly allStatuses: string;
    readonly search: string;
    readonly apply: string;
    readonly empty: string;
    readonly order: string;
    readonly customer: string;
    readonly detailTitle: string;
    readonly backToList: string;
    readonly customerNote: string;
    readonly adminNote: string;
    readonly lines: string;
    readonly item: string;
    readonly requested: string;
    readonly accepted: string;
    readonly restocked: string;
    readonly condition: string;
    readonly conditions: Record<"resellable" | "damaged", string>;
    readonly acceptedFor: string;
    readonly restockedFor: string;
    readonly inspectHint: string;
    readonly approve: string;
    readonly reject: string;
    readonly cancel: string;
    readonly receive: string;
    readonly inspect: string;
    readonly refund: string;
    readonly refundStatus: string;
    readonly orderReturns: string;
    readonly viewAll: string;
    readonly pageOf: string;
    readonly previous: string;
    readonly next: string;
    readonly notices: Record<ReturnAdminNoticeKey, string>;
  };
}

const fr: ReturnTranslations = {
  title: "Retourner des articles", intro: "Choisissez les quantités à retourner et le motif. Nous vous confirmons la demande, puis le remboursement après réception et contrôle.",
  quantityFor: "Quantité à retourner pour {name}", ordered: "{n} commandé(s), {left} retournable(s)", reason: "Motif du retour", note: "Commentaire",
  noteHint: "Facultatif, 1 000 caractères au plus.", submit: "Demander le retour", yours: "Vos demandes de retour", number: "Numéro", status: "Statut", createdOn: "Demandé le",
  refundAmount: "Montant remboursé", nothingReturnable: "Tous les articles de cette commande font déjà l’objet d’une demande de retour.",
  reasons: { defective: "Article défectueux", damaged: "Article endommagé à la livraison", wrong_item: "Erreur d’article", not_as_described: "Non conforme à la description", no_longer_needed: "Ne convient plus", other: "Autre motif" },
  statuses: { REQUESTED: "Demandé", APPROVED: "Accepté — en attente du colis", REJECTED: "Refusé", RECEIVED: "Colis reçu", INSPECTED: "Contrôlé — remboursement en cours", REFUNDED: "Remboursé", CLOSED: "Clos sans remboursement", CANCELLED: "Annulé" },
  notices: {
    requested: "Votre demande de retour est enregistrée.", notEligible: "Cette commande ne peut pas faire l’objet d’un retour.", rateLimited: "Trop de tentatives. Réessayez dans quelques minutes.",
    generic: "Une erreur est survenue. Réessayez.", empty: "Indiquez au moins un article à retourner.", tooMany: "Trop de lignes dans la demande.",
    unknownLine: "Un article ne fait pas partie de cette commande.", quantity: "Une quantité dépasse ce qui peut être retourné.", duplicate: "Un article apparaît deux fois.",
  },
  admin: {
    listTitle: "Retours clients", listIntro: "Demandes de retour des commandes de la boutique, des plus récentes aux plus anciennes.", filters: "Filtrer les retours",
    allStatuses: "Tous les statuts", search: "N° de retour, de commande ou e-mail", apply: "Filtrer", empty: "Aucun retour.", order: "Commande", customer: "Client",
    detailTitle: "Retour {number}", backToList: "Retour à la liste", customerNote: "Commentaire du client", adminNote: "Note interne", lines: "Articles retournés", item: "Article",
    requested: "Demandé", accepted: "Accepté", restocked: "Remis en stock", condition: "État", conditions: { resellable: "Revendable", damaged: "Non revendable (en partie)" },
    acceptedFor: "Quantité acceptée pour {name}", restockedFor: "Quantité remise en stock pour {name}",
    inspectHint: "Accepté : remboursé au prix payé. Remis en stock : revendable, entre en stock Logistics. Rien d’accepté : le retour est clos sans remboursement.",
    approve: "Accepter la demande", reject: "Refuser la demande", cancel: "Annuler le retour", receive: "Confirmer la réception du colis", inspect: "Valider le contrôle",
    refund: "Rembourser", refundStatus: "Remboursement", orderReturns: "Retours de cette commande", viewAll: "Tous les retours", pageOf: "Page {page} sur {pages}",
    previous: "Page précédente", next: "Page suivante",
    notices: {
      approved: "Demande acceptée.", rejected: "Demande refusée.", cancelled: "Retour annulé.", received: "Réception enregistrée.", inspected: "Contrôle validé, remise en stock effectuée.",
      closed: "Contrôle validé : rien d’accepté, retour clos.", refunded: "Remboursement effectué.", refundPending: "Remboursement demandé, en attente de confirmation du prestataire.",
      refundFailed: "Le prestataire a refusé le remboursement : vous pouvez réessayer.", conflict: "Action impossible dans l’état actuel du retour.",
      invalid: "Quantités invalides : 0 ≤ remis en stock ≤ accepté ≤ demandé.", forbidden: "Vous n’avez pas les droits nécessaires.", notFound: "Retour introuvable.",
      noPayment: "Commande sans paiement en ligne : remboursez-la hors ligne.", unavailable: "Les paiements en ligne sont désactivés.", exceeded: "Le montant dépasse ce qui reste remboursable sur le paiement.",
      generic: "Une erreur est survenue. Réessayez.",
    },
  },
};

const en: ReturnTranslations = {
  title: "Return items", intro: "Choose the quantities to return and a reason. We confirm the request, then refund you once the parcel is received and checked.",
  quantityFor: "Quantity to return for {name}", ordered: "{n} ordered, {left} returnable", reason: "Return reason", note: "Comment",
  noteHint: "Optional, up to 1,000 characters.", submit: "Request a return", yours: "Your return requests", number: "Number", status: "Status", createdOn: "Requested on",
  refundAmount: "Refunded amount", nothingReturnable: "Every item of this order already has a return request.",
  reasons: { defective: "Defective item", damaged: "Damaged on delivery", wrong_item: "Wrong item", not_as_described: "Not as described", no_longer_needed: "No longer needed", other: "Other reason" },
  statuses: { REQUESTED: "Requested", APPROVED: "Approved — awaiting parcel", REJECTED: "Rejected", RECEIVED: "Parcel received", INSPECTED: "Checked — refund in progress", REFUNDED: "Refunded", CLOSED: "Closed without refund", CANCELLED: "Cancelled" },
  notices: {
    requested: "Your return request has been recorded.", notEligible: "This order cannot be returned.", rateLimited: "Too many attempts. Try again in a few minutes.",
    generic: "Something went wrong. Please try again.", empty: "Select at least one item to return.", tooMany: "Too many lines in the request.",
    unknownLine: "An item is not part of this order.", quantity: "A quantity exceeds what can be returned.", duplicate: "An item appears twice.",
  },
  admin: {
    listTitle: "Customer returns", listIntro: "Return requests for shop orders, newest first.", filters: "Filter returns",
    allStatuses: "All statuses", search: "Return or order number, or email", apply: "Filter", empty: "No returns.", order: "Order", customer: "Customer",
    detailTitle: "Return {number}", backToList: "Back to the list", customerNote: "Customer comment", adminNote: "Internal note", lines: "Returned items", item: "Item",
    requested: "Requested", accepted: "Accepted", restocked: "Restocked", condition: "Condition", conditions: { resellable: "Resellable", damaged: "Not (fully) resellable" },
    acceptedFor: "Accepted quantity for {name}", restockedFor: "Restocked quantity for {name}",
    inspectHint: "Accepted: refunded at the price paid. Restocked: resellable, goes back to Logistics stock. Nothing accepted: the return is closed without refund.",
    approve: "Approve the request", reject: "Reject the request", cancel: "Cancel the return", receive: "Confirm the parcel was received", inspect: "Confirm the inspection",
    refund: "Refund", refundStatus: "Refund", orderReturns: "Returns for this order", viewAll: "All returns", pageOf: "Page {page} of {pages}",
    previous: "Previous page", next: "Next page",
    notices: {
      approved: "Request approved.", rejected: "Request rejected.", cancelled: "Return cancelled.", received: "Receipt recorded.", inspected: "Inspection confirmed, stock updated.",
      closed: "Inspection confirmed: nothing accepted, return closed.", refunded: "Refund completed.", refundPending: "Refund requested, awaiting confirmation from the provider.",
      refundFailed: "The provider declined the refund: you can try again.", conflict: "This action is not possible in the return’s current state.",
      invalid: "Invalid quantities: 0 ≤ restocked ≤ accepted ≤ requested.", forbidden: "You do not have the required permissions.", notFound: "Return not found.",
      noPayment: "Order without online payment: refund it offline.", unavailable: "Online payments are disabled.", exceeded: "The amount exceeds what remains refundable on the payment.",
      generic: "Something went wrong. Please try again.",
    },
  },
};

const es: ReturnTranslations = {
  title: "Devolver artículos", intro: "Elija las cantidades que desea devolver y el motivo. Confirmamos la solicitud y le reembolsamos tras recibir y revisar el paquete.",
  quantityFor: "Cantidad a devolver de {name}", ordered: "{n} pedido(s), {left} retornable(s)", reason: "Motivo de la devolución", note: "Comentario",
  noteHint: "Opcional, 1000 caracteres como máximo.", submit: "Solicitar la devolución", yours: "Sus solicitudes de devolución", number: "Número", status: "Estado", createdOn: "Solicitada el",
  refundAmount: "Importe reembolsado", nothingReturnable: "Todos los artículos de este pedido ya tienen una solicitud de devolución.",
  reasons: { defective: "Artículo defectuoso", damaged: "Dañado en la entrega", wrong_item: "Artículo equivocado", not_as_described: "No coincide con la descripción", no_longer_needed: "Ya no lo necesito", other: "Otro motivo" },
  statuses: { REQUESTED: "Solicitada", APPROVED: "Aceptada — esperando el paquete", REJECTED: "Rechazada", RECEIVED: "Paquete recibido", INSPECTED: "Revisada — reembolso en curso", REFUNDED: "Reembolsada", CLOSED: "Cerrada sin reembolso", CANCELLED: "Cancelada" },
  notices: {
    requested: "Su solicitud de devolución se ha registrado.", notEligible: "Este pedido no admite devoluciones.", rateLimited: "Demasiados intentos. Vuelva a intentarlo en unos minutos.",
    generic: "Se ha producido un error. Vuelva a intentarlo.", empty: "Indique al menos un artículo a devolver.", tooMany: "Demasiadas líneas en la solicitud.",
    unknownLine: "Un artículo no pertenece a este pedido.", quantity: "Una cantidad supera lo que se puede devolver.", duplicate: "Un artículo aparece dos veces.",
  },
  admin: {
    listTitle: "Devoluciones de clientes", listIntro: "Solicitudes de devolución de los pedidos de la tienda, de la más reciente a la más antigua.", filters: "Filtrar devoluciones",
    allStatuses: "Todos los estados", search: "N.º de devolución, de pedido o correo", apply: "Filtrar", empty: "No hay devoluciones.", order: "Pedido", customer: "Cliente",
    detailTitle: "Devolución {number}", backToList: "Volver a la lista", customerNote: "Comentario del cliente", adminNote: "Nota interna", lines: "Artículos devueltos", item: "Artículo",
    requested: "Solicitado", accepted: "Aceptado", restocked: "Repuesto en stock", condition: "Estado", conditions: { resellable: "Revendible", damaged: "No revendible (en parte)" },
    acceptedFor: "Cantidad aceptada de {name}", restockedFor: "Cantidad repuesta en stock de {name}",
    inspectHint: "Aceptado: se reembolsa al precio pagado. Repuesto: revendible, vuelve al stock de Logística. Nada aceptado: la devolución se cierra sin reembolso.",
    approve: "Aceptar la solicitud", reject: "Rechazar la solicitud", cancel: "Cancelar la devolución", receive: "Confirmar la recepción del paquete", inspect: "Validar la revisión",
    refund: "Reembolsar", refundStatus: "Reembolso", orderReturns: "Devoluciones de este pedido", viewAll: "Todas las devoluciones", pageOf: "Página {page} de {pages}",
    previous: "Página anterior", next: "Página siguiente",
    notices: {
      approved: "Solicitud aceptada.", rejected: "Solicitud rechazada.", cancelled: "Devolución cancelada.", received: "Recepción registrada.", inspected: "Revisión validada, stock actualizado.",
      closed: "Revisión validada: nada aceptado, devolución cerrada.", refunded: "Reembolso realizado.", refundPending: "Reembolso solicitado, pendiente de confirmación del proveedor.",
      refundFailed: "El proveedor rechazó el reembolso: puede volver a intentarlo.", conflict: "Acción imposible en el estado actual de la devolución.",
      invalid: "Cantidades no válidas: 0 ≤ repuesto ≤ aceptado ≤ solicitado.", forbidden: "No tiene los permisos necesarios.", notFound: "Devolución no encontrada.",
      noPayment: "Pedido sin pago en línea: reembólselo fuera de línea.", unavailable: "Los pagos en línea están desactivados.", exceeded: "El importe supera lo que queda por reembolsar del pago.",
      generic: "Se ha producido un error. Vuelva a intentarlo.",
    },
  },
};

const ar: ReturnTranslations = {
  title: "إرجاع منتجات", intro: "اختر الكميات المراد إرجاعها والسبب. نؤكد الطلب، ثم نردّ المبلغ بعد استلام الطرد وفحصه.",
  quantityFor: "الكمية المراد إرجاعها من {name}", ordered: "{n} مطلوبة، {left} قابلة للإرجاع", reason: "سبب الإرجاع", note: "تعليق",
  noteHint: "اختياري، 1000 حرف كحد أقصى.", submit: "طلب الإرجاع", yours: "طلبات الإرجاع الخاصة بك", number: "الرقم", status: "الحالة", createdOn: "تاريخ الطلب",
  refundAmount: "المبلغ المسترد", nothingReturnable: "جميع منتجات هذا الطلب لديها طلب إرجاع بالفعل.",
  reasons: { defective: "منتج معيب", damaged: "تلف أثناء التوصيل", wrong_item: "منتج خاطئ", not_as_described: "غير مطابق للوصف", no_longer_needed: "لم أعد بحاجة إليه", other: "سبب آخر" },
  statuses: { REQUESTED: "مطلوب", APPROVED: "مقبول — بانتظار الطرد", REJECTED: "مرفوض", RECEIVED: "تم استلام الطرد", INSPECTED: "تم الفحص — الاسترداد جارٍ", REFUNDED: "تم الاسترداد", CLOSED: "مغلق دون استرداد", CANCELLED: "ملغى" },
  notices: {
    requested: "تم تسجيل طلب الإرجاع.", notEligible: "لا يمكن إرجاع هذا الطلب.", rateLimited: "محاولات كثيرة جدًا. أعد المحاولة بعد بضع دقائق.",
    generic: "حدث خطأ. أعد المحاولة.", empty: "حدّد منتجًا واحدًا على الأقل لإرجاعه.", tooMany: "عدد الأسطر في الطلب كبير جدًا.",
    unknownLine: "أحد المنتجات ليس جزءًا من هذا الطلب.", quantity: "إحدى الكميات تتجاوز ما يمكن إرجاعه.", duplicate: "أحد المنتجات مكرر.",
  },
  admin: {
    listTitle: "مرتجعات العملاء", listIntro: "طلبات إرجاع طلبات المتجر، من الأحدث إلى الأقدم.", filters: "تصفية المرتجعات",
    allStatuses: "جميع الحالات", search: "رقم الإرجاع أو الطلب أو البريد الإلكتروني", apply: "تصفية", empty: "لا توجد مرتجعات.", order: "الطلب", customer: "العميل",
    detailTitle: "الإرجاع {number}", backToList: "العودة إلى القائمة", customerNote: "تعليق العميل", adminNote: "ملاحظة داخلية", lines: "المنتجات المرتجعة", item: "المنتج",
    requested: "المطلوب", accepted: "المقبول", restocked: "المعاد إلى المخزون", condition: "الحالة", conditions: { resellable: "قابل لإعادة البيع", damaged: "غير قابل لإعادة البيع (جزئيًا)" },
    acceptedFor: "الكمية المقبولة من {name}", restockedFor: "الكمية المعادة إلى المخزون من {name}",
    inspectHint: "المقبول: يُسترد بالسعر المدفوع. المعاد إلى المخزون: قابل لإعادة البيع ويدخل مخزون اللوجستيات. لا شيء مقبول: يُغلق الإرجاع دون استرداد.",
    approve: "قبول الطلب", reject: "رفض الطلب", cancel: "إلغاء الإرجاع", receive: "تأكيد استلام الطرد", inspect: "تأكيد الفحص",
    refund: "استرداد", refundStatus: "الاسترداد", orderReturns: "مرتجعات هذا الطلب", viewAll: "جميع المرتجعات", pageOf: "الصفحة {page} من {pages}",
    previous: "الصفحة السابقة", next: "الصفحة التالية",
    notices: {
      approved: "تم قبول الطلب.", rejected: "تم رفض الطلب.", cancelled: "تم إلغاء الإرجاع.", received: "تم تسجيل الاستلام.", inspected: "تم تأكيد الفحص وتحديث المخزون.",
      closed: "تم تأكيد الفحص: لا شيء مقبول، أُغلق الإرجاع.", refunded: "تم الاسترداد.", refundPending: "تم طلب الاسترداد، بانتظار تأكيد مزوّد الدفع.",
      refundFailed: "رفض مزوّد الدفع الاسترداد: يمكنك إعادة المحاولة.", conflict: "لا يمكن تنفيذ هذا الإجراء في الحالة الحالية للإرجاع.",
      invalid: "كميات غير صالحة: 0 ≤ المعاد ≤ المقبول ≤ المطلوب.", forbidden: "ليست لديك الصلاحيات اللازمة.", notFound: "الإرجاع غير موجود.",
      noPayment: "طلب دون دفع إلكتروني: استرده خارج الإنترنت.", unavailable: "المدفوعات الإلكترونية معطلة.", exceeded: "المبلغ يتجاوز ما تبقى قابلًا للاسترداد من الدفعة.",
      generic: "حدث خطأ. أعد المحاولة.",
    },
  },
};

const translations: Record<Locale, ReturnTranslations> = { fr, en, es, ar };

export const getReturnTranslations = (locale: Locale): ReturnTranslations => translations[locale];
