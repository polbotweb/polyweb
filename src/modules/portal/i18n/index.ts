/** Libellés du portail client (espace « Mon compte ») — 4 locales. Statuts : libellés des modules propriétaires. */
import type { Locale } from "@i18n/config";

export type PortalTranslations = {
  title: string; intro: string; nav: string;
  invoices: string; orders: string; bookings: string; refunds: string;
  noInvoices: string; noOrders: string; noBookings: string; noRefunds: string;
  number: string; document: string; date: string; dueDate: string; amount: string; balance: string; status: string; actions: string;
  resource: string; when: string; reason: string; subject: string;
  downloadPdf: string; pay: string; viewOrder: string; manageBooking: string;
  subjects: { invoice: string; order: string; booking: string };
  linkNote: string;
};

const fr: PortalTranslations = {
  title: "Mon espace client", intro: "Retrouvez vos factures, commandes, réservations et remboursements.", nav: "Sections de l'espace client",
  invoices: "Factures", orders: "Commandes", bookings: "Réservations", refunds: "Remboursements",
  noInvoices: "Aucune facture.", noOrders: "Aucune commande.", noBookings: "Aucune réservation.", noRefunds: "Aucun remboursement.",
  number: "Numéro", document: "Document", date: "Date", dueDate: "Échéance", amount: "Montant", balance: "Reste à payer", status: "Statut", actions: "Actions",
  resource: "Ressource", when: "Créneau", reason: "Motif", subject: "Objet",
  downloadPdf: "Télécharger le PDF de {ref}", pay: "Payer {ref}", viewOrder: "Suivre la commande {ref}", manageBooking: "Gérer la réservation {ref}",
  subjects: { invoice: "Facture", order: "Commande", booking: "Réservation" },
  linkNote: "Seuls les documents rattachés à votre compte (adresse e-mail vérifiée) apparaissent ici.",
};
const en: PortalTranslations = {
  title: "My customer account", intro: "Find your invoices, orders, bookings and refunds.", nav: "Account sections",
  invoices: "Invoices", orders: "Orders", bookings: "Bookings", refunds: "Refunds",
  noInvoices: "No invoices.", noOrders: "No orders.", noBookings: "No bookings.", noRefunds: "No refunds.",
  number: "Number", document: "Document", date: "Date", dueDate: "Due date", amount: "Amount", balance: "Balance due", status: "Status", actions: "Actions",
  resource: "Resource", when: "Time slot", reason: "Reason", subject: "Subject",
  downloadPdf: "Download PDF of {ref}", pay: "Pay {ref}", viewOrder: "Track order {ref}", manageBooking: "Manage booking {ref}",
  subjects: { invoice: "Invoice", order: "Order", booking: "Booking" },
  linkNote: "Only documents linked to your account (verified email address) are shown here.",
};
const es: PortalTranslations = {
  title: "Mi área de cliente", intro: "Consulte sus facturas, pedidos, reservas y reembolsos.", nav: "Secciones del área de cliente",
  invoices: "Facturas", orders: "Pedidos", bookings: "Reservas", refunds: "Reembolsos",
  noInvoices: "Ninguna factura.", noOrders: "Ningún pedido.", noBookings: "Ninguna reserva.", noRefunds: "Ningún reembolso.",
  number: "Número", document: "Documento", date: "Fecha", dueDate: "Vencimiento", amount: "Importe", balance: "Pendiente de pago", status: "Estado", actions: "Acciones",
  resource: "Recurso", when: "Franja horaria", reason: "Motivo", subject: "Objeto",
  downloadPdf: "Descargar el PDF de {ref}", pay: "Pagar {ref}", viewOrder: "Seguir el pedido {ref}", manageBooking: "Gestionar la reserva {ref}",
  subjects: { invoice: "Factura", order: "Pedido", booking: "Reserva" },
  linkNote: "Solo aparecen aquí los documentos vinculados a su cuenta (correo electrónico verificado).",
};
const ar: PortalTranslations = {
  title: "حسابي كعميل", intro: "اطّلع على فواتيرك وطلباتك وحجوزاتك ومبالغك المستردة.", nav: "أقسام حساب العميل",
  invoices: "الفواتير", orders: "الطلبات", bookings: "الحجوزات", refunds: "المبالغ المستردة",
  noInvoices: "لا توجد فواتير.", noOrders: "لا توجد طلبات.", noBookings: "لا توجد حجوزات.", noRefunds: "لا توجد مبالغ مستردة.",
  number: "الرقم", document: "المستند", date: "التاريخ", dueDate: "تاريخ الاستحقاق", amount: "المبلغ", balance: "المبلغ المتبقي", status: "الحالة", actions: "الإجراءات",
  resource: "المورد", when: "الموعد", reason: "السبب", subject: "الموضوع",
  downloadPdf: "تنزيل ملف PDF لـ {ref}", pay: "دفع {ref}", viewOrder: "تتبّع الطلب {ref}", manageBooking: "إدارة الحجز {ref}",
  subjects: { invoice: "فاتورة", order: "طلب", booking: "حجز" },
  linkNote: "تظهر هنا فقط المستندات المرتبطة بحسابك (بريد إلكتروني موثّق).",
};

const translations: Record<Locale, PortalTranslations> = { fr, en, es, ar };
export const getPortalTranslations = (locale: Locale): PortalTranslations => translations[locale] ?? fr;
export const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
