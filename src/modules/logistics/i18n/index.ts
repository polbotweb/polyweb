/** Libellés back-office du module logistics (expéditions, entrepôts, articles, stock — 4 locales). */
import type { Locale } from "@i18n/config";
import type { ShipmentStatus } from "../domain/workflow";
import type { MovementKind } from "../domain/stock";

export type LogisticsTranslations = {
  meta: { description: string };
  admin: {
    title: string; shipments: string; warehouses: string; items: string; stock: string; movements: string;
    newShipment: string; newWarehouse: string; newItem: string; edit: string; view: string; back: string;
    empty: string; noWarehouses: string; noItems: string; noStock: string; listLabel: string;
    save: string; create: string; delete: string; saved: string; created: string; deleted: string; facetStatus: string;
    lockedNote: string; none: string; addLine: string; removeLine: string; record: string; transfer: string; confirmDelete: string;
    bulk: { cancel: string; deliver: string };
  };
  fields: {
    number: string; title: string; status: string; warehouse: string; salesDocument: string; recipientName: string; address: string; country: string;
    carrier: string; trackingNumber: string; weightGrams: string; notes: string; shippedAt: string; deliveredAt: string; lines: string;
    sku: string; description: string; quantity: string; code: string; name: string; active: string; variant: string;
    level: string; kind: string; reference: string; fromWarehouse: string; toWarehouse: string; units: string;
  };
  actions: { moveTo: string; updateTracking: string };
  statuses: Record<ShipmentStatus, string>;
  movementKinds: Record<MovementKind, string>;
};

const translations: Record<Locale, LogisticsTranslations> = {
  fr: {
    meta: { description: "Entrepôts, stock et expéditions (bons de livraison)." },
    admin: {
      title: "Logistique", shipments: "Expéditions", warehouses: "Entrepôts", items: "Articles", stock: "Stock", movements: "Mouvements",
      newShipment: "Nouvelle expédition", newWarehouse: "Nouvel entrepôt", newItem: "Nouvel article", edit: "Modifier", view: "Ouvrir", back: "Toutes les expéditions",
      empty: "Aucune expédition.", noWarehouses: "Aucun entrepôt.", noItems: "Aucun article.", noStock: "Aucun stock.", listLabel: "Liste des expéditions",
      save: "Enregistrer", create: "Créer", delete: "Supprimer", saved: "Enregistré.", created: "Créé.", deleted: "Supprimé.", facetStatus: "Statut",
      lockedNote: "Expédition validée : repassez-la en brouillon pour la modifier.", none: "—", addLine: "Ajouter une ligne", removeLine: "Retirer",
      record: "Enregistrer le mouvement", transfer: "Transférer", confirmDelete: "Supprimer définitivement ?",
      bulk: { cancel: "Annuler", deliver: "Marquer livrées" },
    },
    fields: {
      number: "N° de BL", title: "Intitulé", status: "Statut", warehouse: "Entrepôt", salesDocument: "Document de vente", recipientName: "Destinataire", address: "Adresse", country: "Pays (ISO)",
      carrier: "Transporteur", trackingNumber: "N° de suivi", weightGrams: "Poids (g)", notes: "Notes", shippedAt: "Expédiée le", deliveredAt: "Livrée le", lines: "Lignes",
      sku: "SKU", description: "Description", quantity: "Quantité", code: "Code", name: "Nom", active: "Actif", variant: "Variante boutique (id)",
      level: "Niveau", kind: "Type", reference: "Référence", fromWarehouse: "Depuis", toWarehouse: "Vers", units: "Unités",
    },
    actions: { moveTo: "Passer à", updateTracking: "Mettre à jour le suivi" },
    statuses: { DRAFT: "Brouillon", READY: "Prête", SHIPPED: "Expédiée", DELIVERED: "Livrée", RETURNED: "Retournée", CANCELLED: "Annulée" },
    movementKinds: { receipt: "Réception", issue: "Sortie", adjustment: "Ajustement", transfer_in: "Transfert entrant", transfer_out: "Transfert sortant", shipment: "Expédition", return: "Retour" },
  },
  en: {
    meta: { description: "Warehouses, stock and shipments (delivery notes)." },
    admin: {
      title: "Logistics", shipments: "Shipments", warehouses: "Warehouses", items: "Items", stock: "Stock", movements: "Movements",
      newShipment: "New shipment", newWarehouse: "New warehouse", newItem: "New item", edit: "Edit", view: "Open", back: "All shipments",
      empty: "No shipments.", noWarehouses: "No warehouses.", noItems: "No items.", noStock: "No stock.", listLabel: "Shipment list",
      save: "Save", create: "Create", delete: "Delete", saved: "Saved.", created: "Created.", deleted: "Deleted.", facetStatus: "Status",
      lockedNote: "Confirmed shipment: move it back to draft to edit.", none: "—", addLine: "Add line", removeLine: "Remove",
      record: "Record movement", transfer: "Transfer", confirmDelete: "Delete permanently?",
      bulk: { cancel: "Cancel", deliver: "Mark delivered" },
    },
    fields: {
      number: "Delivery note no.", title: "Title", status: "Status", warehouse: "Warehouse", salesDocument: "Sales document", recipientName: "Recipient", address: "Address", country: "Country (ISO)",
      carrier: "Carrier", trackingNumber: "Tracking no.", weightGrams: "Weight (g)", notes: "Notes", shippedAt: "Shipped on", deliveredAt: "Delivered on", lines: "Lines",
      sku: "SKU", description: "Description", quantity: "Quantity", code: "Code", name: "Name", active: "Active", variant: "Shop variant (id)",
      level: "Level", kind: "Type", reference: "Reference", fromWarehouse: "From", toWarehouse: "To", units: "Units",
    },
    actions: { moveTo: "Move to", updateTracking: "Update tracking" },
    statuses: { DRAFT: "Draft", READY: "Ready", SHIPPED: "Shipped", DELIVERED: "Delivered", RETURNED: "Returned", CANCELLED: "Cancelled" },
    movementKinds: { receipt: "Receipt", issue: "Issue", adjustment: "Adjustment", transfer_in: "Transfer in", transfer_out: "Transfer out", shipment: "Shipment", return: "Return" },
  },
  es: {
    meta: { description: "Almacenes, existencias y envíos (albaranes)." },
    admin: {
      title: "Logística", shipments: "Envíos", warehouses: "Almacenes", items: "Artículos", stock: "Existencias", movements: "Movimientos",
      newShipment: "Nuevo envío", newWarehouse: "Nuevo almacén", newItem: "Nuevo artículo", edit: "Editar", view: "Abrir", back: "Todos los envíos",
      empty: "Sin envíos.", noWarehouses: "Sin almacenes.", noItems: "Sin artículos.", noStock: "Sin existencias.", listLabel: "Lista de envíos",
      save: "Guardar", create: "Crear", delete: "Eliminar", saved: "Guardado.", created: "Creado.", deleted: "Eliminado.", facetStatus: "Estado",
      lockedNote: "Envío confirmado: vuelva a borrador para editarlo.", none: "—", addLine: "Añadir línea", removeLine: "Quitar",
      record: "Registrar movimiento", transfer: "Transferir", confirmDelete: "¿Eliminar definitivamente?",
      bulk: { cancel: "Cancelar", deliver: "Marcar entregados" },
    },
    fields: {
      number: "N.º de albarán", title: "Título", status: "Estado", warehouse: "Almacén", salesDocument: "Documento de venta", recipientName: "Destinatario", address: "Dirección", country: "País (ISO)",
      carrier: "Transportista", trackingNumber: "N.º de seguimiento", weightGrams: "Peso (g)", notes: "Notas", shippedAt: "Enviado el", deliveredAt: "Entregado el", lines: "Líneas",
      sku: "SKU", description: "Descripción", quantity: "Cantidad", code: "Código", name: "Nombre", active: "Activo", variant: "Variante de tienda (id)",
      level: "Nivel", kind: "Tipo", reference: "Referencia", fromWarehouse: "Desde", toWarehouse: "Hacia", units: "Unidades",
    },
    actions: { moveTo: "Pasar a", updateTracking: "Actualizar seguimiento" },
    statuses: { DRAFT: "Borrador", READY: "Listo", SHIPPED: "Enviado", DELIVERED: "Entregado", RETURNED: "Devuelto", CANCELLED: "Cancelado" },
    movementKinds: { receipt: "Recepción", issue: "Salida", adjustment: "Ajuste", transfer_in: "Transferencia entrante", transfer_out: "Transferencia saliente", shipment: "Envío", return: "Devolución" },
  },
  ar: {
    meta: { description: "المستودعات والمخزون والشحنات (إيصالات التسليم)." },
    admin: {
      title: "الخدمات اللوجستية", shipments: "الشحنات", warehouses: "المستودعات", items: "الأصناف", stock: "المخزون", movements: "الحركات",
      newShipment: "شحنة جديدة", newWarehouse: "مستودع جديد", newItem: "صنف جديد", edit: "تعديل", view: "فتح", back: "كل الشحنات",
      empty: "لا توجد شحنات.", noWarehouses: "لا توجد مستودعات.", noItems: "لا توجد أصناف.", noStock: "لا يوجد مخزون.", listLabel: "قائمة الشحنات",
      save: "حفظ", create: "إنشاء", delete: "حذف", saved: "تم الحفظ.", created: "تم الإنشاء.", deleted: "تم الحذف.", facetStatus: "الحالة",
      lockedNote: "شحنة مؤكدة: أعدها إلى المسودة لتعديلها.", none: "—", addLine: "إضافة سطر", removeLine: "إزالة",
      record: "تسجيل الحركة", transfer: "تحويل", confirmDelete: "حذف نهائي؟",
      bulk: { cancel: "إلغاء", deliver: "تعليم كمسلَّمة" },
    },
    fields: {
      number: "رقم إيصال التسليم", title: "العنوان", status: "الحالة", warehouse: "المستودع", salesDocument: "مستند البيع", recipientName: "المستلم", address: "العنوان البريدي", country: "البلد (ISO)",
      carrier: "شركة النقل", trackingNumber: "رقم التتبع", weightGrams: "الوزن (غ)", notes: "ملاحظات", shippedAt: "تاريخ الشحن", deliveredAt: "تاريخ التسليم", lines: "الأسطر",
      sku: "SKU", description: "الوصف", quantity: "الكمية", code: "الرمز", name: "الاسم", active: "نشط", variant: "متغير المتجر (المعرّف)",
      level: "المستوى", kind: "النوع", reference: "المرجع", fromWarehouse: "من", toWarehouse: "إلى", units: "الوحدات",
    },
    actions: { moveTo: "نقل إلى", updateTracking: "تحديث التتبع" },
    statuses: { DRAFT: "مسودة", READY: "جاهزة", SHIPPED: "مشحونة", DELIVERED: "مسلَّمة", RETURNED: "مرتجعة", CANCELLED: "ملغاة" },
    movementKinds: { receipt: "استلام", issue: "صرف", adjustment: "تسوية", transfer_in: "تحويل وارد", transfer_out: "تحويل صادر", shipment: "شحن", return: "إرجاع" },
  },
};

export function getLogisticsTranslations(locale: Locale): LogisticsTranslations {
  return translations[locale];
}
