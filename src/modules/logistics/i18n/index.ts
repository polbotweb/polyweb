/** Libellés back-office du module logistics (expéditions, entrepôts, articles, stock — 4 locales). */
import type { Locale } from "@i18n/config";
import type { ShipmentStatus } from "../domain/workflow";
import type { MovementKind, MovementSource } from "../domain/stock";
import type { InventoryCountStatus } from "../domain/inventory";

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
  movementSources: Record<MovementSource, string>;
  inventoryStatuses: Record<InventoryCountStatus, string>;
  inventory: {
    title: string; ledger: string; open: string; none: string; noItems: string; listLabel: string; back: string; backToList: string;
    number: string; createdBy: string; createdAt: string; validatedBy: string; validatedAt: string; note: string;
    lines: string; counted: string; expected: string; system: string; variance: string; discrepancies: string; netVariance: string;
    countedBy: string; saveCounts: string; validate: string; cancel: string; confirmValidate: string; confirmCancel: string;
    opened: string; countsSaved: string; validated: string; cancelled: string; uncounted: string;
    openHint: string; countHint: string; closedNote: string;
    filters: string; apply: string; reset: string; from: string; to: string; user: string; source: string; all: string;
    results: string; empty: string;
  };
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
    movementSources: { manual: "Saisie manuelle", transfer: "Transfert", shipment: "Expédition", inventory: "Inventaire", purchase: "Réception d'achat", order: "Commande boutique", return: "Retour client" },
    inventoryStatuses: { OPEN: "En cours", VALIDATED: "Validé", CANCELLED: "Annulé" },
    inventory: {
      title: "Inventaires", ledger: "Grand livre de stock", open: "Ouvrir un inventaire", none: "Aucun inventaire.", noItems: "Aucun article à inventorier.", listLabel: "Liste des inventaires", back: "Stock", backToList: "Tous les inventaires",
      number: "N° d'inventaire", createdBy: "Ouvert par", createdAt: "Ouvert le", validatedBy: "Validé par", validatedAt: "Validé le", note: "Note",
      lines: "Lignes", counted: "Compté", expected: "Théorique à l'ouverture", system: "Stock à la validation", variance: "Écart", discrepancies: "Écarts", netVariance: "Écart net",
      countedBy: "Compté par", saveCounts: "Enregistrer les comptages", validate: "Valider l'inventaire", cancel: "Annuler l'inventaire", confirmValidate: "Valider et poster les ajustements d'écart ?", confirmCancel: "Annuler cet inventaire (aucun mouvement posté) ?",
      opened: "Inventaire ouvert.", countsSaved: "Comptages enregistrés.", validated: "Inventaire validé.", cancelled: "Inventaire annulé.", uncounted: "Non compté",
      openHint: "Le stock théorique est figé à l'ouverture ; à la validation, le stock est aligné sur les quantités comptées.", countHint: "Laisser vide une ligne non comptée : elle est ignorée à la validation.", closedNote: "Inventaire clos : consultation seule.",
      filters: "Filtres", apply: "Filtrer", reset: "Réinitialiser", from: "Du", to: "Au", user: "Utilisateur", source: "Origine", all: "Tous",
      results: "{total} mouvement(s)", empty: "Aucun mouvement pour ces filtres.",
    },
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
    movementSources: { manual: "Manual entry", transfer: "Transfer", shipment: "Shipment", inventory: "Stock count", purchase: "Purchase receipt", order: "Shop order", return: "Customer return" },
    inventoryStatuses: { OPEN: "In progress", VALIDATED: "Validated", CANCELLED: "Cancelled" },
    inventory: {
      title: "Stock counts", ledger: "Stock ledger", open: "Start a stock count", none: "No stock counts.", noItems: "No items to count.", listLabel: "Stock count list", back: "Stock", backToList: "All stock counts",
      number: "Count no.", createdBy: "Started by", createdAt: "Started on", validatedBy: "Validated by", validatedAt: "Validated on", note: "Note",
      lines: "Lines", counted: "Counted", expected: "Expected at start", system: "Stock at validation", variance: "Variance", discrepancies: "Discrepancies", netVariance: "Net variance",
      countedBy: "Counted by", saveCounts: "Save counts", validate: "Validate count", cancel: "Cancel count", confirmValidate: "Validate and post variance adjustments?", confirmCancel: "Cancel this count (no movement posted)?",
      opened: "Stock count started.", countsSaved: "Counts saved.", validated: "Stock count validated.", cancelled: "Stock count cancelled.", uncounted: "Not counted",
      openHint: "Expected stock is captured at start; on validation, stock is aligned with the counted quantities.", countHint: "Leave a line empty if not counted: it is ignored on validation.", closedNote: "Closed stock count: read only.",
      filters: "Filters", apply: "Filter", reset: "Reset", from: "From", to: "To", user: "User", source: "Origin", all: "All",
      results: "{total} movement(s)", empty: "No movements match these filters.",
    },
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
    movementSources: { manual: "Entrada manual", transfer: "Transferencia", shipment: "Envío", inventory: "Inventario", purchase: "Recepción de compra", order: "Pedido de tienda", return: "Devolución de cliente" },
    inventoryStatuses: { OPEN: "En curso", VALIDATED: "Validado", CANCELLED: "Cancelado" },
    inventory: {
      title: "Inventarios", ledger: "Libro de existencias", open: "Abrir un inventario", none: "Sin inventarios.", noItems: "Sin artículos que inventariar.", listLabel: "Lista de inventarios", back: "Existencias", backToList: "Todos los inventarios",
      number: "N.º de inventario", createdBy: "Abierto por", createdAt: "Abierto el", validatedBy: "Validado por", validatedAt: "Validado el", note: "Nota",
      lines: "Líneas", counted: "Contado", expected: "Teórico al abrir", system: "Existencias al validar", variance: "Diferencia", discrepancies: "Diferencias", netVariance: "Diferencia neta",
      countedBy: "Contado por", saveCounts: "Guardar recuentos", validate: "Validar inventario", cancel: "Cancelar inventario", confirmValidate: "¿Validar y registrar los ajustes de diferencia?", confirmCancel: "¿Cancelar este inventario (sin movimientos)?",
      opened: "Inventario abierto.", countsSaved: "Recuentos guardados.", validated: "Inventario validado.", cancelled: "Inventario cancelado.", uncounted: "Sin contar",
      openHint: "Las existencias teóricas se fijan al abrir; al validar, las existencias se ajustan a las cantidades contadas.", countHint: "Deje vacía una línea no contada: se ignora al validar.", closedNote: "Inventario cerrado: solo lectura.",
      filters: "Filtros", apply: "Filtrar", reset: "Restablecer", from: "Desde", to: "Hasta", user: "Usuario", source: "Origen", all: "Todos",
      results: "{total} movimiento(s)", empty: "Ningún movimiento con estos filtros.",
    },
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
    movementSources: { manual: "إدخال يدوي", transfer: "تحويل", shipment: "شحن", inventory: "جرد", purchase: "استلام مشتريات", order: "طلب المتجر", return: "إرجاع العميل" },
    inventoryStatuses: { OPEN: "قيد التنفيذ", VALIDATED: "معتمد", CANCELLED: "ملغى" },
    inventory: {
      title: "عمليات الجرد", ledger: "سجل حركات المخزون", open: "بدء جرد", none: "لا توجد عمليات جرد.", noItems: "لا توجد أصناف للجرد.", listLabel: "قائمة عمليات الجرد", back: "المخزون", backToList: "كل عمليات الجرد",
      number: "رقم الجرد", createdBy: "بدأه", createdAt: "تاريخ البدء", validatedBy: "اعتمده", validatedAt: "تاريخ الاعتماد", note: "ملاحظة",
      lines: "الأسطر", counted: "المعدود", expected: "النظري عند البدء", system: "المخزون عند الاعتماد", variance: "الفرق", discrepancies: "الفروقات", netVariance: "صافي الفرق",
      countedBy: "عدّه", saveCounts: "حفظ الكميات المعدودة", validate: "اعتماد الجرد", cancel: "إلغاء الجرد", confirmValidate: "اعتماد الجرد وتسجيل تسويات الفروقات؟", confirmCancel: "إلغاء هذا الجرد (دون أي حركة)؟",
      opened: "تم بدء الجرد.", countsSaved: "تم حفظ الكميات.", validated: "تم اعتماد الجرد.", cancelled: "تم إلغاء الجرد.", uncounted: "غير معدود",
      openHint: "يُثبَّت المخزون النظري عند البدء؛ وعند الاعتماد يُضبط المخزون على الكميات المعدودة.", countHint: "اترك السطر فارغًا إن لم يُعدّ: يُتجاهل عند الاعتماد.", closedNote: "جرد مغلق: للاطلاع فقط.",
      filters: "عوامل التصفية", apply: "تصفية", reset: "إعادة تعيين", from: "من", to: "إلى", user: "المستخدم", source: "المصدر", all: "الكل",
      results: "{total} حركة", empty: "لا توجد حركات مطابقة.",
    },
  },
};

export function getLogisticsTranslations(locale: Locale): LogisticsTranslations {
  return translations[locale];
}
