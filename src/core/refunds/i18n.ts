/** Libellés du panneau de remboursement (administration), 4 locales. */
import type { Locale } from "@i18n/config";
import type { RefundReason, RefundStatus } from "@database/schemas/refunds.schema";

export type RefundNoticeKey = "done" | "pending" | "failed" | "forbidden" | "notFound" | "notAllowed" | "exceeded" | "invalidAmount" | "conflict" | "tooMany" | "unavailable" | "generic";

export interface RefundsTranslations {
  title: string; empty: string; payment: string; captured: string; refunded: string; inProgress: string; remaining: string;
  history: string; noRefund: string; date: string; amount: string; status: string; reason: string; note: string;
  amountHint: string; noteHint: string; submit: string; fullyRefunded: string;
  statuses: Record<RefundStatus, string>; reasons: Record<RefundReason, string>; notices: Record<RefundNoticeKey, string>;
}

const fr: RefundsTranslations = {
  title: "Remboursements", empty: "Aucun paiement en ligne remboursable.", payment: "Paiement du {date}", captured: "Encaissé", refunded: "Remboursé",
  inProgress: "En cours", remaining: "Remboursable", history: "Historique des remboursements", noRefund: "Aucun remboursement.", date: "Date",
  amount: "Montant", status: "Statut", reason: "Motif", note: "Note interne", amountHint: "Montant au format 12,34 ; au plus le montant remboursable.",
  noteHint: "Facultatif, visible des administrateurs uniquement.", submit: "Rembourser", fullyRefunded: "Paiement entièrement remboursé.",
  statuses: { pending: "En cours", succeeded: "Remboursé", failed: "Échoué", cancelled: "Annulé" },
  reasons: { requested_by_customer: "Demande du client", duplicate: "Paiement en double", fraudulent: "Fraude", return: "Retour de marchandise", cancellation: "Annulation", other: "Autre" },
  notices: {
    done: "Remboursement effectué.", pending: "Remboursement en cours de traitement par le prestataire.", failed: "Le prestataire a refusé le remboursement.",
    forbidden: "Vous n’avez pas les droits pour rembourser ce paiement.", notFound: "Paiement introuvable.", notAllowed: "Ce paiement ne peut pas être remboursé de ce montant.",
    exceeded: "Le montant dépasse le reste remboursable.", invalidAmount: "Montant invalide.", conflict: "Demande déjà traitée avec d’autres paramètres.",
    tooMany: "Trop de demandes, réessayez dans une minute.", unavailable: "Le paiement en ligne est désactivé.", generic: "Une erreur est survenue.",
  },
};
const en: RefundsTranslations = {
  title: "Refunds", empty: "No refundable online payment.", payment: "Payment of {date}", captured: "Captured", refunded: "Refunded",
  inProgress: "In progress", remaining: "Refundable", history: "Refund history", noRefund: "No refunds.", date: "Date",
  amount: "Amount", status: "Status", reason: "Reason", note: "Internal note", amountHint: "Amount such as 12.34; at most the refundable amount.",
  noteHint: "Optional, visible to administrators only.", submit: "Refund", fullyRefunded: "Payment fully refunded.",
  statuses: { pending: "In progress", succeeded: "Refunded", failed: "Failed", cancelled: "Cancelled" },
  reasons: { requested_by_customer: "Customer request", duplicate: "Duplicate payment", fraudulent: "Fraud", return: "Returned goods", cancellation: "Cancellation", other: "Other" },
  notices: {
    done: "Refund completed.", pending: "Refund is being processed by the provider.", failed: "The provider declined the refund.",
    forbidden: "You are not allowed to refund this payment.", notFound: "Payment not found.", notAllowed: "This payment cannot be refunded for this amount.",
    exceeded: "The amount exceeds what is left to refund.", invalidAmount: "Invalid amount.", conflict: "Request already processed with different details.",
    tooMany: "Too many requests, try again in a minute.", unavailable: "Online payments are disabled.", generic: "Something went wrong.",
  },
};
const es: RefundsTranslations = {
  title: "Reembolsos", empty: "Ningún pago en línea reembolsable.", payment: "Pago del {date}", captured: "Cobrado", refunded: "Reembolsado",
  inProgress: "En curso", remaining: "Reembolsable", history: "Historial de reembolsos", noRefund: "Ningún reembolso.", date: "Fecha",
  amount: "Importe", status: "Estado", reason: "Motivo", note: "Nota interna", amountHint: "Importe con formato 12,34; como máximo el importe reembolsable.",
  noteHint: "Opcional, visible solo para los administradores.", submit: "Reembolsar", fullyRefunded: "Pago reembolsado por completo.",
  statuses: { pending: "En curso", succeeded: "Reembolsado", failed: "Fallido", cancelled: "Cancelado" },
  reasons: { requested_by_customer: "Solicitud del cliente", duplicate: "Pago duplicado", fraudulent: "Fraude", return: "Devolución de mercancía", cancellation: "Cancelación", other: "Otro" },
  notices: {
    done: "Reembolso realizado.", pending: "El proveedor está procesando el reembolso.", failed: "El proveedor rechazó el reembolso.",
    forbidden: "No tiene permiso para reembolsar este pago.", notFound: "Pago no encontrado.", notAllowed: "Este pago no puede reembolsarse por este importe.",
    exceeded: "El importe supera lo que queda por reembolsar.", invalidAmount: "Importe no válido.", conflict: "Solicitud ya tratada con otros datos.",
    tooMany: "Demasiadas solicitudes, inténtelo de nuevo en un minuto.", unavailable: "El pago en línea está desactivado.", generic: "Se ha producido un error.",
  },
};
const ar: RefundsTranslations = {
  title: "المبالغ المستردة", empty: "لا توجد دفعة إلكترونية قابلة للاسترداد.", payment: "دفعة بتاريخ {date}", captured: "المبلغ المحصَّل", refunded: "المبلغ المسترد",
  inProgress: "قيد المعالجة", remaining: "القابل للاسترداد", history: "سجل الاستردادات", noRefund: "لا توجد استردادات.", date: "التاريخ",
  amount: "المبلغ", status: "الحالة", reason: "السبب", note: "ملاحظة داخلية", amountHint: "مبلغ بصيغة 12.34، بحد أقصى المبلغ القابل للاسترداد.",
  noteHint: "اختياري، يظهر للمسؤولين فقط.", submit: "استرداد", fullyRefunded: "تم استرداد الدفعة بالكامل.",
  statuses: { pending: "قيد المعالجة", succeeded: "تم الاسترداد", failed: "فشل", cancelled: "أُلغي" },
  reasons: { requested_by_customer: "طلب العميل", duplicate: "دفعة مكررة", fraudulent: "احتيال", return: "إرجاع البضاعة", cancellation: "إلغاء", other: "أخرى" },
  notices: {
    done: "تم الاسترداد.", pending: "مزوّد الدفع يعالج الاسترداد.", failed: "رفض مزوّد الدفع الاسترداد.",
    forbidden: "لا تملك صلاحية استرداد هذه الدفعة.", notFound: "الدفعة غير موجودة.", notAllowed: "لا يمكن استرداد هذا المبلغ من هذه الدفعة.",
    exceeded: "المبلغ يتجاوز المتبقي القابل للاسترداد.", invalidAmount: "مبلغ غير صالح.", conflict: "تمت معالجة الطلب مسبقًا ببيانات مختلفة.",
    tooMany: "طلبات كثيرة، أعد المحاولة بعد دقيقة.", unavailable: "الدفع الإلكتروني معطّل.", generic: "حدث خطأ.",
  },
};

const TRANSLATIONS: Record<Locale, RefundsTranslations> = { fr, en, es, ar };
export const getRefundsTranslations = (locale: Locale): RefundsTranslations => TRANSLATIONS[locale] ?? fr;
