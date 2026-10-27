/** Libellés back-office du module sales (devis, factures, avoirs, encaissements, relances — 4 locales). */
import type { Locale } from "@i18n/config";
import type { PaymentMethod } from "../domain/payments";
import type { SalesDocumentKind, SalesStatus } from "../domain/workflow";

export type SalesTranslations = {
  meta: { description: string };
  admin: {
    title: string; newQuote: string; newInvoice: string; edit: string; view: string; back: string; empty: string; listLabel: string;
    save: string; create: string; saved: string; created: string; facetKind: string; facetStatus: string; draftNumber: string; lockedNote: string;
    bulk: { cancel: string; expire: string };
  };
  fields: {
    title: string; number: string; kind: string; status: string; customerName: string; customerEmail: string; customerAddress: string; customerCountry: string;
    customerType: string; customerVatNumber: string; sellerCountry: string; supplyType: string; ossRegistered: string; currency: string; issueDate: string;
    dueDate: string; validUntil: string; paymentTermDays: string; notes: string; net: string; tax: string; gross: string; paid: string; credited: string; due: string; mention: string;
  };
  lines: { title: string; description: string; quantity: string; unitPrice: string; discount: string; taxCategory: string; rate: string; net: string; add: string; remove: string };
  actions: { send: string; accept: string; reject: string; expire: string; issue: string; cancel: string; convert: string; creditNote: string; remind: string; recordPayment: string; reminderNone: string; reminderSent: string; downloadPdf: string };
  payments: { title: string; amount: string; method: string; paidAt: string; reference: string; empty: string; methods: Record<PaymentMethod, string> };
  reminders: { title: string; level: string; daysOverdue: string; sentAt: string; empty: string };
  related: string;
  kinds: Record<SalesDocumentKind, string>;
  statuses: Record<SalesStatus, string>;
  supplyTypes: { goods: string; services: string };
  seller: { title: string; intro: string; legalName: string; vatNumber: string; legalId: string; legalIdScheme: string; legalIdHint: string; addressLine1: string; addressLine2: string; postcode: string; city: string; country: string; email: string; iban: string; bic: string; save: string; saved: string; link: string };
};

const translations: Record<Locale, SalesTranslations> = {
  fr: {
    meta: { description: "Devis, factures, avoirs, encaissements et relances." },
    admin: { title: "Ventes", newQuote: "Nouveau devis", newInvoice: "Nouvelle facture", edit: "Modifier", view: "Ouvrir", back: "Tous les documents", empty: "Aucun document de vente.", listLabel: "Liste des documents de vente", save: "Enregistrer", create: "Créer le brouillon", saved: "Document enregistré.", created: "Brouillon créé.", facetKind: "Type", facetStatus: "Statut", draftNumber: "Brouillon (non numéroté)", lockedNote: "Document émis : il ne peut plus être modifié. Corrigez-le par un avoir.", bulk: { cancel: "Annuler", expire: "Marquer expirés" } },
    fields: { title: "Objet", number: "Numéro", kind: "Type", status: "Statut", customerName: "Client", customerEmail: "E-mail du client", customerAddress: "Adresse du client", customerCountry: "Pays du client (ISO)", customerType: "Type de client", customerVatNumber: "N° de TVA du client", sellerCountry: "Pays du vendeur (ISO)", supplyType: "Nature", ossRegistered: "Inscrit au guichet unique (OSS)", currency: "Devise", issueDate: "Date d'émission", dueDate: "Échéance", validUntil: "Valable jusqu'au", paymentTermDays: "Délai de paiement (jours)", notes: "Notes", net: "Total HT", tax: "TVA", gross: "Total TTC", paid: "Encaissé", credited: "Avoirs", due: "Reste dû", mention: "Mention TVA" },
    lines: { title: "Lignes", description: "Désignation", quantity: "Quantité", unitPrice: "Prix unitaire HT", discount: "Remise (%)", taxCategory: "Catégorie TVA", rate: "Taux", net: "Montant HT", add: "Ajouter une ligne", remove: "Supprimer la ligne" },
    actions: { send: "Envoyer", accept: "Accepter", reject: "Refuser", expire: "Expirer", issue: "Émettre", cancel: "Annuler", convert: "Convertir en facture", creditNote: "Créer un avoir", remind: "Relancer", recordPayment: "Enregistrer l'encaissement", reminderNone: "Aucune relance due.", reminderSent: "Relance enregistrée.", downloadPdf: "Télécharger le PDF" },
    payments: { title: "Encaissements", amount: "Montant", method: "Moyen", paidAt: "Date", reference: "Référence", empty: "Aucun encaissement.", methods: { bank_transfer: "Virement", card: "Carte", cash: "Espèces", check: "Chèque", direct_debit: "Prélèvement", other: "Autre" } },
    reminders: { title: "Relances", level: "Niveau", daysOverdue: "Jours de retard", sentAt: "Date", empty: "Aucune relance." },
    related: "Documents liés",
    kinds: { quote: "Devis", invoice: "Facture", credit_note: "Avoir" },
    statuses: { DRAFT: "Brouillon", SENT: "Envoyé", ACCEPTED: "Accepté", REJECTED: "Refusé", EXPIRED: "Expiré", CONVERTED: "Converti", ISSUED: "Émise", PARTIALLY_PAID: "Partiellement payée", PAID: "Payée", CREDITED: "Créditée", CANCELLED: "Annulé" },
    supplyTypes: { goods: "Biens", services: "Services" },
    seller: { title: "Profil vendeur", intro: "Identité légale imprimée sur les factures et reprise dans le XML Factur-X (EN 16931). Sans profil, les PDF sont générés sans XML Factur-X.", legalName: "Raison sociale", vatNumber: "N° de TVA intracommunautaire", legalId: "Identifiant légal (SIREN…)", legalIdScheme: "Schéma de l'identifiant (ISO 6523)", legalIdHint: "« 0002 » pour un SIREN (9 chiffres, clé vérifiée).", addressLine1: "Adresse (ligne 1)", addressLine2: "Adresse (ligne 2)", postcode: "Code postal", city: "Ville", country: "Pays (ISO, 2 lettres)", email: "E-mail de facturation", iban: "IBAN", bic: "BIC", save: "Enregistrer", saved: "Profil vendeur enregistré.", link: "Profil vendeur (Factur-X)" },
  },
  en: {
    meta: { description: "Quotes, invoices, credit notes, payments and reminders." },
    admin: { title: "Sales", newQuote: "New quote", newInvoice: "New invoice", edit: "Edit", view: "Open", back: "All documents", empty: "No sales documents.", listLabel: "Sales document list", save: "Save", create: "Create draft", saved: "Document saved.", created: "Draft created.", facetKind: "Type", facetStatus: "Status", draftNumber: "Draft (unnumbered)", lockedNote: "Issued document: it can no longer be edited. Correct it with a credit note.", bulk: { cancel: "Cancel", expire: "Mark expired" } },
    fields: { title: "Subject", number: "Number", kind: "Type", status: "Status", customerName: "Customer", customerEmail: "Customer e-mail", customerAddress: "Customer address", customerCountry: "Customer country (ISO)", customerType: "Customer type", customerVatNumber: "Customer VAT number", sellerCountry: "Seller country (ISO)", supplyType: "Supply", ossRegistered: "Registered for OSS", currency: "Currency", issueDate: "Issue date", dueDate: "Due date", validUntil: "Valid until", paymentTermDays: "Payment term (days)", notes: "Notes", net: "Net total", tax: "VAT", gross: "Gross total", paid: "Paid", credited: "Credited", due: "Amount due", mention: "VAT note" },
    lines: { title: "Lines", description: "Description", quantity: "Quantity", unitPrice: "Unit price (net)", discount: "Discount (%)", taxCategory: "VAT category", rate: "Rate", net: "Net amount", add: "Add line", remove: "Remove line" },
    actions: { send: "Send", accept: "Accept", reject: "Reject", expire: "Expire", issue: "Issue", cancel: "Cancel", convert: "Convert to invoice", creditNote: "Create credit note", remind: "Send reminder", recordPayment: "Record payment", reminderNone: "No reminder due.", reminderSent: "Reminder recorded.", downloadPdf: "Download PDF" },
    payments: { title: "Payments", amount: "Amount", method: "Method", paidAt: "Date", reference: "Reference", empty: "No payments.", methods: { bank_transfer: "Bank transfer", card: "Card", cash: "Cash", check: "Cheque", direct_debit: "Direct debit", other: "Other" } },
    reminders: { title: "Reminders", level: "Level", daysOverdue: "Days overdue", sentAt: "Date", empty: "No reminders." },
    related: "Related documents",
    kinds: { quote: "Quote", invoice: "Invoice", credit_note: "Credit note" },
    statuses: { DRAFT: "Draft", SENT: "Sent", ACCEPTED: "Accepted", REJECTED: "Rejected", EXPIRED: "Expired", CONVERTED: "Converted", ISSUED: "Issued", PARTIALLY_PAID: "Partially paid", PAID: "Paid", CREDITED: "Credited", CANCELLED: "Cancelled" },
    supplyTypes: { goods: "Goods", services: "Services" },
    seller: { title: "Seller profile", intro: "Legal identity printed on invoices and carried in the Factur-X XML (EN 16931). Without a profile, PDFs are generated without Factur-X XML.", legalName: "Legal name", vatNumber: "VAT number", legalId: "Legal identifier (SIREN…)", legalIdScheme: "Identifier scheme (ISO 6523)", legalIdHint: "\"0002\" for a French SIREN (9 digits, checksum verified).", addressLine1: "Address (line 1)", addressLine2: "Address (line 2)", postcode: "Postcode", city: "City", country: "Country (ISO, 2 letters)", email: "Billing e-mail", iban: "IBAN", bic: "BIC", save: "Save", saved: "Seller profile saved.", link: "Seller profile (Factur-X)" },
  },
  es: {
    meta: { description: "Presupuestos, facturas, abonos, cobros y recordatorios." },
    admin: { title: "Ventas", newQuote: "Nuevo presupuesto", newInvoice: "Nueva factura", edit: "Editar", view: "Abrir", back: "Todos los documentos", empty: "No hay documentos de venta.", listLabel: "Lista de documentos de venta", save: "Guardar", create: "Crear borrador", saved: "Documento guardado.", created: "Borrador creado.", facetKind: "Tipo", facetStatus: "Estado", draftNumber: "Borrador (sin numerar)", lockedNote: "Documento emitido: ya no se puede modificar. Corríjalo con un abono.", bulk: { cancel: "Cancelar", expire: "Marcar caducados" } },
    fields: { title: "Asunto", number: "Número", kind: "Tipo", status: "Estado", customerName: "Cliente", customerEmail: "Correo del cliente", customerAddress: "Dirección del cliente", customerCountry: "País del cliente (ISO)", customerType: "Tipo de cliente", customerVatNumber: "NIF-IVA del cliente", sellerCountry: "País del vendedor (ISO)", supplyType: "Naturaleza", ossRegistered: "Inscrito en la ventanilla única (OSS)", currency: "Moneda", issueDate: "Fecha de emisión", dueDate: "Vencimiento", validUntil: "Válido hasta", paymentTermDays: "Plazo de pago (días)", notes: "Notas", net: "Base imponible", tax: "IVA", gross: "Total", paid: "Cobrado", credited: "Abonado", due: "Pendiente", mention: "Mención IVA" },
    lines: { title: "Líneas", description: "Descripción", quantity: "Cantidad", unitPrice: "Precio unitario (sin IVA)", discount: "Descuento (%)", taxCategory: "Categoría de IVA", rate: "Tipo", net: "Importe sin IVA", add: "Añadir línea", remove: "Eliminar línea" },
    actions: { send: "Enviar", accept: "Aceptar", reject: "Rechazar", expire: "Caducar", issue: "Emitir", cancel: "Cancelar", convert: "Convertir en factura", creditNote: "Crear abono", remind: "Enviar recordatorio", recordPayment: "Registrar cobro", reminderNone: "Ningún recordatorio pendiente.", reminderSent: "Recordatorio registrado.", downloadPdf: "Descargar PDF" },
    payments: { title: "Cobros", amount: "Importe", method: "Medio", paidAt: "Fecha", reference: "Referencia", empty: "Sin cobros.", methods: { bank_transfer: "Transferencia", card: "Tarjeta", cash: "Efectivo", check: "Cheque", direct_debit: "Domiciliación", other: "Otro" } },
    reminders: { title: "Recordatorios", level: "Nivel", daysOverdue: "Días de retraso", sentAt: "Fecha", empty: "Sin recordatorios." },
    related: "Documentos relacionados",
    kinds: { quote: "Presupuesto", invoice: "Factura", credit_note: "Abono" },
    statuses: { DRAFT: "Borrador", SENT: "Enviado", ACCEPTED: "Aceptado", REJECTED: "Rechazado", EXPIRED: "Caducado", CONVERTED: "Convertido", ISSUED: "Emitida", PARTIALLY_PAID: "Pagada parcialmente", PAID: "Pagada", CREDITED: "Abonada", CANCELLED: "Cancelado" },
    supplyTypes: { goods: "Bienes", services: "Servicios" },
    seller: { title: "Perfil del vendedor", intro: "Identidad legal impresa en las facturas e incluida en el XML Factur-X (EN 16931). Sin perfil, los PDF se generan sin XML Factur-X.", legalName: "Razón social", vatNumber: "NIF-IVA", legalId: "Identificador legal (SIREN…)", legalIdScheme: "Esquema del identificador (ISO 6523)", legalIdHint: "«0002» para un SIREN francés (9 dígitos, dígito de control verificado).", addressLine1: "Dirección (línea 1)", addressLine2: "Dirección (línea 2)", postcode: "Código postal", city: "Ciudad", country: "País (ISO, 2 letras)", email: "Correo de facturación", iban: "IBAN", bic: "BIC", save: "Guardar", saved: "Perfil del vendedor guardado.", link: "Perfil del vendedor (Factur-X)" },
  },
  ar: {
    meta: { description: "عروض الأسعار والفواتير والإشعارات الدائنة والتحصيلات والتذكيرات." },
    admin: { title: "المبيعات", newQuote: "عرض سعر جديد", newInvoice: "فاتورة جديدة", edit: "تعديل", view: "فتح", back: "كل المستندات", empty: "لا توجد مستندات مبيعات.", listLabel: "قائمة مستندات المبيعات", save: "حفظ", create: "إنشاء مسودة", saved: "تم حفظ المستند.", created: "تم إنشاء المسودة.", facetKind: "النوع", facetStatus: "الحالة", draftNumber: "مسودة (بدون رقم)", lockedNote: "مستند صادر: لم يعد قابلاً للتعديل. صحّحه بإشعار دائن.", bulk: { cancel: "إلغاء", expire: "وضع علامة منتهي" } },
    fields: { title: "الموضوع", number: "الرقم", kind: "النوع", status: "الحالة", customerName: "العميل", customerEmail: "بريد العميل", customerAddress: "عنوان العميل", customerCountry: "بلد العميل (ISO)", customerType: "نوع العميل", customerVatNumber: "الرقم الضريبي للعميل", sellerCountry: "بلد البائع (ISO)", supplyType: "طبيعة التوريد", ossRegistered: "مسجل في الشباك الموحد (OSS)", currency: "العملة", issueDate: "تاريخ الإصدار", dueDate: "تاريخ الاستحقاق", validUntil: "صالح حتى", paymentTermDays: "مهلة الدفع (أيام)", notes: "ملاحظات", net: "الإجمالي بدون ضريبة", tax: "الضريبة", gross: "الإجمالي مع الضريبة", paid: "المحصَّل", credited: "الإشعارات الدائنة", due: "المتبقي", mention: "بيان الضريبة" },
    lines: { title: "البنود", description: "الوصف", quantity: "الكمية", unitPrice: "سعر الوحدة بدون ضريبة", discount: "الخصم (%)", taxCategory: "فئة الضريبة", rate: "النسبة", net: "المبلغ بدون ضريبة", add: "إضافة بند", remove: "حذف البند" },
    actions: { send: "إرسال", accept: "قبول", reject: "رفض", expire: "إنهاء الصلاحية", issue: "إصدار", cancel: "إلغاء", convert: "تحويل إلى فاتورة", creditNote: "إنشاء إشعار دائن", remind: "إرسال تذكير", recordPayment: "تسجيل التحصيل", reminderNone: "لا يوجد تذكير مستحق.", reminderSent: "تم تسجيل التذكير.", downloadPdf: "تنزيل PDF" },
    payments: { title: "التحصيلات", amount: "المبلغ", method: "الوسيلة", paidAt: "التاريخ", reference: "المرجع", empty: "لا توجد تحصيلات.", methods: { bank_transfer: "تحويل بنكي", card: "بطاقة", cash: "نقدًا", check: "شيك", direct_debit: "اقتطاع مباشر", other: "أخرى" } },
    reminders: { title: "التذكيرات", level: "المستوى", daysOverdue: "أيام التأخير", sentAt: "التاريخ", empty: "لا توجد تذكيرات." },
    related: "مستندات مرتبطة",
    kinds: { quote: "عرض سعر", invoice: "فاتورة", credit_note: "إشعار دائن" },
    statuses: { DRAFT: "مسودة", SENT: "مُرسَل", ACCEPTED: "مقبول", REJECTED: "مرفوض", EXPIRED: "منتهي", CONVERTED: "مُحوَّل", ISSUED: "صادرة", PARTIALLY_PAID: "مدفوعة جزئيًا", PAID: "مدفوعة", CREDITED: "مُلغاة بإشعار دائن", CANCELLED: "ملغى" },
    supplyTypes: { goods: "سلع", services: "خدمات" },
    seller: { title: "ملف البائع", intro: "الهوية القانونية المطبوعة على الفواتير والمضمنة في ملف XML لـ Factur-X ‏(EN 16931). بدون ملف، تُنشأ ملفات PDF دون XML Factur-X.", legalName: "الاسم القانوني", vatNumber: "رقم ضريبة القيمة المضافة", legalId: "المعرّف القانوني (SIREN…)", legalIdScheme: "مخطط المعرّف (ISO 6523)", legalIdHint: "«0002» لرقم SIREN الفرنسي (9 أرقام، مع التحقق من رقم التدقيق).", addressLine1: "العنوان (السطر 1)", addressLine2: "العنوان (السطر 2)", postcode: "الرمز البريدي", city: "المدينة", country: "البلد (ISO، حرفان)", email: "البريد الإلكتروني للفوترة", iban: "IBAN", bic: "BIC", save: "حفظ", saved: "تم حفظ ملف البائع.", link: "ملف البائع (Factur-X)" },
  },
};

export function getSalesTranslations(locale: Locale): SalesTranslations {
  return translations[locale];
}
