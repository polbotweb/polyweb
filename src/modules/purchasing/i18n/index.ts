/** Libellés back-office du module purchasing (fournisseurs, commandes, réceptions — 4 locales). */
import type { Locale } from "@i18n/config";
import type { PurchaseOrderStatus } from "../domain/workflow";

export type PurchasingTranslations = {
  meta: { description: string };
  admin: {
    title: string; orders: string; suppliers: string; receipts: string;
    newOrder: string; newSupplier: string; edit: string; view: string; back: string;
    empty: string; noSuppliers: string; noReceipts: string; listLabel: string;
    save: string; create: string; delete: string; saved: string; created: string; deleted: string; facetStatus: string;
    lockedNote: string; none: string; addLine: string; removeLine: string; receive: string; receiveTitle: string; outstanding: string;
    confirmDelete: string; noWarehouses: string;
    bulk: { cancel: string; close: string };
  };
  fields: {
    number: string; title: string; status: string; supplier: string; warehouse: string; currency: string; expectedDate: string; notes: string;
    net: string; sentAt: string; lines: string; sku: string; description: string; quantity: string; unitPrice: string; received: string;
    code: string; name: string; email: string; country: string; vatNumber: string; address: string; paymentTermDays: string; active: string;
    supplierReference: string; receivedAt: string;
  };
  actions: { moveTo: string };
  statuses: Record<PurchaseOrderStatus, string>;
};

const translations: Record<Locale, PurchasingTranslations> = {
  fr: {
    meta: { description: "Fournisseurs, commandes fournisseur et réceptions de marchandises." },
    admin: {
      title: "Achats", orders: "Commandes fournisseur", suppliers: "Fournisseurs", receipts: "Réceptions",
      newOrder: "Nouvelle commande", newSupplier: "Nouveau fournisseur", edit: "Modifier", view: "Ouvrir", back: "Toutes les commandes",
      empty: "Aucune commande fournisseur.", noSuppliers: "Aucun fournisseur.", noReceipts: "Aucune réception.", listLabel: "Liste des commandes fournisseur",
      save: "Enregistrer", create: "Créer", delete: "Supprimer", saved: "Enregistré.", created: "Créé.", deleted: "Supprimé.", facetStatus: "Statut",
      lockedNote: "Commande envoyée : repassez-la en brouillon pour la modifier.", none: "—", addLine: "Ajouter une ligne", removeLine: "Retirer",
      receive: "Réceptionner", receiveTitle: "Réception de marchandises", outstanding: "Reste à recevoir",
      confirmDelete: "Supprimer définitivement ?", noWarehouses: "Créez d'abord un entrepôt et des articles dans Logistique.",
      bulk: { cancel: "Annuler", close: "Solder" },
    },
    fields: {
      number: "N° de BC", title: "Intitulé", status: "Statut", supplier: "Fournisseur", warehouse: "Entrepôt de réception", currency: "Devise", expectedDate: "Livraison prévue", notes: "Notes",
      net: "Total HT", sentAt: "Envoyée le", lines: "Lignes", sku: "SKU", description: "Description", quantity: "Quantité", unitPrice: "Prix unitaire HT", received: "Reçu",
      code: "Code", name: "Nom", email: "E-mail", country: "Pays (ISO)", vatNumber: "N° de TVA", address: "Adresse", paymentTermDays: "Délai de paiement (jours)", active: "Actif",
      supplierReference: "Réf. bon de livraison fournisseur", receivedAt: "Reçu le",
    },
    actions: { moveTo: "Passer à" },
    statuses: { DRAFT: "Brouillon", SENT: "Envoyée", PARTIALLY_RECEIVED: "Partiellement reçue", RECEIVED: "Reçue", CLOSED: "Soldée", CANCELLED: "Annulée" },
  },
  en: {
    meta: { description: "Suppliers, purchase orders and goods receipts." },
    admin: {
      title: "Purchasing", orders: "Purchase orders", suppliers: "Suppliers", receipts: "Receipts",
      newOrder: "New purchase order", newSupplier: "New supplier", edit: "Edit", view: "Open", back: "All purchase orders",
      empty: "No purchase orders.", noSuppliers: "No suppliers.", noReceipts: "No receipts.", listLabel: "Purchase order list",
      save: "Save", create: "Create", delete: "Delete", saved: "Saved.", created: "Created.", deleted: "Deleted.", facetStatus: "Status",
      lockedNote: "Order sent: move it back to draft to edit it.", none: "—", addLine: "Add line", removeLine: "Remove",
      receive: "Receive", receiveTitle: "Goods receipt", outstanding: "Outstanding",
      confirmDelete: "Delete permanently?", noWarehouses: "Create a warehouse and items in Logistics first.",
      bulk: { cancel: "Cancel", close: "Close" },
    },
    fields: {
      number: "PO number", title: "Title", status: "Status", supplier: "Supplier", warehouse: "Receiving warehouse", currency: "Currency", expectedDate: "Expected delivery", notes: "Notes",
      net: "Net total", sentAt: "Sent on", lines: "Lines", sku: "SKU", description: "Description", quantity: "Quantity", unitPrice: "Unit price (net)", received: "Received",
      code: "Code", name: "Name", email: "Email", country: "Country (ISO)", vatNumber: "VAT number", address: "Address", paymentTermDays: "Payment terms (days)", active: "Active",
      supplierReference: "Supplier delivery note ref.", receivedAt: "Received on",
    },
    actions: { moveTo: "Move to" },
    statuses: { DRAFT: "Draft", SENT: "Sent", PARTIALLY_RECEIVED: "Partially received", RECEIVED: "Received", CLOSED: "Closed", CANCELLED: "Cancelled" },
  },
  es: {
    meta: { description: "Proveedores, pedidos de compra y recepciones de mercancía." },
    admin: {
      title: "Compras", orders: "Pedidos de compra", suppliers: "Proveedores", receipts: "Recepciones",
      newOrder: "Nuevo pedido de compra", newSupplier: "Nuevo proveedor", edit: "Editar", view: "Abrir", back: "Todos los pedidos",
      empty: "No hay pedidos de compra.", noSuppliers: "No hay proveedores.", noReceipts: "No hay recepciones.", listLabel: "Lista de pedidos de compra",
      save: "Guardar", create: "Crear", delete: "Eliminar", saved: "Guardado.", created: "Creado.", deleted: "Eliminado.", facetStatus: "Estado",
      lockedNote: "Pedido enviado: vuelva a borrador para editarlo.", none: "—", addLine: "Añadir línea", removeLine: "Quitar",
      receive: "Recepcionar", receiveTitle: "Recepción de mercancía", outstanding: "Pendiente",
      confirmDelete: "¿Eliminar definitivamente?", noWarehouses: "Cree primero un almacén y artículos en Logística.",
      bulk: { cancel: "Cancelar", close: "Cerrar" },
    },
    fields: {
      number: "N.º de pedido", title: "Título", status: "Estado", supplier: "Proveedor", warehouse: "Almacén de recepción", currency: "Moneda", expectedDate: "Entrega prevista", notes: "Notas",
      net: "Total neto", sentAt: "Enviado el", lines: "Líneas", sku: "SKU", description: "Descripción", quantity: "Cantidad", unitPrice: "Precio unitario (neto)", received: "Recibido",
      code: "Código", name: "Nombre", email: "Correo", country: "País (ISO)", vatNumber: "N.º de IVA", address: "Dirección", paymentTermDays: "Plazo de pago (días)", active: "Activo",
      supplierReference: "Ref. albarán del proveedor", receivedAt: "Recibido el",
    },
    actions: { moveTo: "Pasar a" },
    statuses: { DRAFT: "Borrador", SENT: "Enviado", PARTIALLY_RECEIVED: "Recibido parcialmente", RECEIVED: "Recibido", CLOSED: "Cerrado", CANCELLED: "Cancelado" },
  },
  ar: {
    meta: { description: "الموردون وأوامر الشراء واستلام البضائع." },
    admin: {
      title: "المشتريات", orders: "أوامر الشراء", suppliers: "الموردون", receipts: "الاستلامات",
      newOrder: "أمر شراء جديد", newSupplier: "مورد جديد", edit: "تعديل", view: "فتح", back: "كل أوامر الشراء",
      empty: "لا توجد أوامر شراء.", noSuppliers: "لا يوجد موردون.", noReceipts: "لا توجد استلامات.", listLabel: "قائمة أوامر الشراء",
      save: "حفظ", create: "إنشاء", delete: "حذف", saved: "تم الحفظ.", created: "تم الإنشاء.", deleted: "تم الحذف.", facetStatus: "الحالة",
      lockedNote: "تم إرسال الأمر: أعده إلى مسودة لتعديله.", none: "—", addLine: "إضافة سطر", removeLine: "إزالة",
      receive: "استلام", receiveTitle: "استلام البضائع", outstanding: "المتبقي",
      confirmDelete: "حذف نهائيًا؟", noWarehouses: "أنشئ أولًا مستودعًا وأصنافًا في الخدمات اللوجستية.",
      bulk: { cancel: "إلغاء", close: "إقفال" },
    },
    fields: {
      number: "رقم أمر الشراء", title: "العنوان", status: "الحالة", supplier: "المورد", warehouse: "مستودع الاستلام", currency: "العملة", expectedDate: "التسليم المتوقع", notes: "ملاحظات",
      net: "الإجمالي الصافي", sentAt: "أُرسل في", lines: "الأسطر", sku: "SKU", description: "الوصف", quantity: "الكمية", unitPrice: "سعر الوحدة (صافٍ)", received: "المستلَم",
      code: "الرمز", name: "الاسم", email: "البريد الإلكتروني", country: "البلد (ISO)", vatNumber: "الرقم الضريبي", address: "العنوان", paymentTermDays: "مهلة الدفع (أيام)", active: "نشط",
      supplierReference: "مرجع إيصال تسليم المورد", receivedAt: "استُلم في",
    },
    actions: { moveTo: "نقل إلى" },
    statuses: { DRAFT: "مسودة", SENT: "مُرسَل", PARTIALLY_RECEIVED: "مستلَم جزئيًا", RECEIVED: "مستلَم", CLOSED: "مُقفَل", CANCELLED: "ملغى" },
  },
};

export function getPurchasingTranslations(locale: Locale): PurchasingTranslations {
  return translations[locale];
}
