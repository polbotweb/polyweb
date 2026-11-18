/** Libellés back-office du module purchasing (fournisseurs, commandes, réceptions — 4 locales). */
import type { Locale } from "@i18n/config";
import type { PurchaseOrderStatus } from "../domain/workflow";

export type PurchasingTranslations = {
  meta: { description: string };
  admin: {
    title: string; orders: string; suppliers: string; receipts: string; invoices: string; settings: string; reorder: string; returns: string; sepa: string; imports: string;
    newOrder: string; newSupplier: string; edit: string; view: string; back: string;
    empty: string; noSuppliers: string; noReceipts: string; listLabel: string;
    save: string; create: string; delete: string; saved: string; created: string; deleted: string; facetStatus: string;
    lockedNote: string; none: string; addLine: string; removeLine: string; receive: string; receiveTitle: string; outstanding: string;
    confirmDelete: string; noWarehouses: string;
    newInvoice: string; issue: string; pay: string; approve: string; reject: string;
    emptyInvoices: string; emptyReturns: string; emptySepa: string; emptyImports: string; emptyReorder: string;
    quality: string; landed: string; runReorder: string; newReturn: string; newRule: string; exportSepa: string; upload: string;
    reorderMode: string; matching: string; approval: string; prefixes: string; debtor: string;
    modeOff: string; modeSuggestions: string; modeAutoDraft: string; modeAutoSend: string;
    twoWay: string; threeWay: string; policyAccept: string; policyBlock: string;
    approvalNone: string; approvalThreshold: string; approvalBands: string;
    includeReservations: string; autoSendTrusted: string; allowService: string; allowMultiWh: string; qualityRequired: string;
    reorderHour: string; toleranceAbs: string; tolerancePct: string; threshold: string; taxCategory: string;
    addBand: string; removeBand: string; bandsHelp: string; bandLevel: string; bandMin: string; bandMax: string; bandRole: string; bandPermission: string;
    emailTemplates: string; emailPurpose: string; emailSubject: string; emailBody: string; emailTemplatesHelp: string; addTemplate: string;
    prefixPo: string; prefixReceipt: string; prefixInvoice: string; prefixCredit: string; prefixReturn: string; prefixSepa: string;
    matchingMode: string; matchingPolicy: string;
    roleOrgMember: string; roleOrgAdmin: string; roleOrgOwner: string; roleAdmin: string; roleAny: string;
    purposePoSend: string; purposePoReminder: string; purposeReturnNotice: string;
    bulk: { cancel: string; close: string };
  };
  fields: {
    number: string; title: string; status: string; supplier: string; warehouse: string; currency: string; expectedDate: string; notes: string;
    net: string; sentAt: string; lines: string; sku: string; description: string; quantity: string; unitPrice: string; received: string;
    code: string; name: string; email: string; country: string; vatNumber: string; address: string; paymentTermDays: string; active: string;
    supplierReference: string; receivedAt: string;
    iban: string; bic: string; debtorName: string; supplierInvoiceNumber: string; dueDate: string; amount: string; method: string; paidAt: string; reference: string; match: string;
    kind: string; stock: string; service: string; lineWarehouse: string;
    crmCompanyId: string; crmContactId: string; trustedCatalogue: string; punchout: string; punchoutEnabled: string;
    punchoutSetupUrl: string; punchoutIdentity: string; punchoutDomain: string; punchoutSecret: string; keepSecret: string; sepaName: string;
  };
  actions: { moveTo: string };
  statuses: Record<PurchaseOrderStatus, string>;
};

const translations: Record<Locale, PurchasingTranslations> = {
  fr: {
    meta: { description: "Fournisseurs, commandes fournisseur et réceptions de marchandises." },
    admin: {
      title: "Achats", orders: "Commandes fournisseur", suppliers: "Fournisseurs", receipts: "Réceptions", invoices: "Factures fournisseur", settings: "Réglages", reorder: "Réassort", returns: "Retours", sepa: "Virements SEPA", imports: "Factures électroniques",
      newOrder: "Nouvelle commande", newSupplier: "Nouveau fournisseur", edit: "Modifier", view: "Ouvrir", back: "Toutes les commandes",
      empty: "Aucune commande fournisseur.", noSuppliers: "Aucun fournisseur.", noReceipts: "Aucune réception.", listLabel: "Liste des commandes fournisseur",
      save: "Enregistrer", create: "Créer", delete: "Supprimer", saved: "Enregistré.", created: "Créé.", deleted: "Supprimé.", facetStatus: "Statut",
      lockedNote: "Commande envoyée : repassez-la en brouillon pour la modifier.", none: "—", addLine: "Ajouter une ligne", removeLine: "Retirer",
      receive: "Réceptionner", receiveTitle: "Réception de marchandises", outstanding: "Reste à recevoir",
      confirmDelete: "Supprimer définitivement ?", noWarehouses: "Créez d'abord un entrepôt et des articles dans Logistique.",
      newInvoice: "Nouvelle facture", issue: "Émettre", pay: "Enregistrer un règlement", approve: "Approuver", reject: "Refuser",
      emptyInvoices: "Aucune facture fournisseur.", emptyReturns: "Aucun retour.", emptySepa: "Aucun lot SEPA.", emptyImports: "Aucune facture électronique importée.", emptyReorder: "Aucune suggestion de réassort.",
      quality: "Contrôle qualité", landed: "Frais d'approche", runReorder: "Calculer le réassort", newReturn: "Nouveau retour", newRule: "Nouvelle règle", exportSepa: "Exporter le lot SEPA", upload: "Importer",
      reorderMode: "Mode de réassort", matching: "Rapprochement", approval: "Validation des commandes", prefixes: "Préfixes de numérotation", debtor: "Compte débiteur SEPA",
      modeOff: "Désactivé", modeSuggestions: "Suggestions seulement", modeAutoDraft: "Créer un brouillon automatiquement", modeAutoSend: "Créer et envoyer (catalogue de confiance)",
      twoWay: "2 voies (commande / facture)", threeWay: "3 voies (commande / réception / facture)", policyAccept: "Autoriser avec acceptation des écarts", policyBlock: "Bloquer l'émission hors tolérance",
      approvalNone: "Aucune", approvalThreshold: "Seuil unique", approvalBands: "Paliers par montant",
      includeReservations: "Inclure les réservations dans le disponible", autoSendTrusted: "Envoi automatique uniquement aux catalogues de confiance",
      allowService: "Autoriser les lignes de prestation (hors stock)", allowMultiWh: "Autoriser plusieurs entrepôts sur une commande", qualityRequired: "Contrôle qualité obligatoire à la réception",
      reorderHour: "Heure du calcul (0-23)", toleranceAbs: "Tolérance absolue (centimes)", tolerancePct: "Tolérance (%)", threshold: "Seuil (centimes)", taxCategory: "Catégorie de taxe",
      addBand: "Ajouter un palier", removeBand: "Retirer le palier", bandsHelp: "Chaque palier s'ajoute aux précédents dès que le montant atteint son minimum. Les paliers sont conservés si vous changez de mode.",
      bandLevel: "Niveau", bandMin: "Minimum (centimes)", bandMax: "Maximum (centimes, vide = aucun)", bandRole: "Rôle requis", bandPermission: "Permission (optionnel)",
      emailTemplates: "Modèles d'e-mail", emailPurpose: "Usage", emailSubject: "Objet", emailBody: "Corps", emailTemplatesHelp: "Surcharge par langue ; à défaut, le modèle par défaut est utilisé. Placeholders : {number}, {title}, {supplierName}.",
      addTemplate: "Ajouter un modèle",
      prefixPo: "Préfixe BC", prefixReceipt: "Préfixe BR", prefixInvoice: "Préfixe FF", prefixCredit: "Préfixe AF", prefixReturn: "Préfixe RF", prefixSepa: "Préfixe SEPA",
      matchingMode: "Mode", matchingPolicy: "Politique",
      roleOrgMember: "Membre", roleOrgAdmin: "Administrateur", roleOrgOwner: "Propriétaire", roleAdmin: "Administrateur plateforme", roleAny: "Tous les rôles",
      purposePoSend: "Envoi du bon de commande", purposePoReminder: "Relance de commande", purposeReturnNotice: "Avis de retour",
      bulk: { cancel: "Annuler", close: "Solder" },
    },
    fields: {
      number: "N° de BC", title: "Intitulé", status: "Statut", supplier: "Fournisseur", warehouse: "Entrepôt de réception", currency: "Devise", expectedDate: "Livraison prévue", notes: "Notes",
      net: "Total HT", sentAt: "Envoyée le", lines: "Lignes", sku: "SKU", description: "Description", quantity: "Quantité", unitPrice: "Prix unitaire HT", received: "Reçu",
      code: "Code", name: "Nom", email: "E-mail", country: "Pays (ISO)", vatNumber: "N° de TVA", address: "Adresse", paymentTermDays: "Délai de paiement (jours)", active: "Actif",
      supplierReference: "Réf. bon de livraison fournisseur", receivedAt: "Reçu le",
      iban: "IBAN", bic: "BIC", debtorName: "Nom du débiteur", supplierInvoiceNumber: "N° facture fournisseur", dueDate: "Échéance", amount: "Montant", method: "Moyen", paidAt: "Payé le", reference: "Référence", match: "Rapprochement",
      kind: "Type", stock: "Stock", service: "Prestation", lineWarehouse: "Entrepôt de la ligne",
      crmCompanyId: "Société CRM", crmContactId: "Contact CRM", trustedCatalogue: "Catalogue de confiance (envoi auto autorisé)",
      punchout: "Punch-out", punchoutEnabled: "Activer le punch-out", punchoutSetupUrl: "URL de setup punch-out",
      punchoutIdentity: "Identité punch-out", punchoutDomain: "Domaine punch-out", punchoutSecret: "Secret punch-out",
      keepSecret: "Laisser vide pour conserver le secret actuel.", sepaName: "Nom SEPA",

    },
    actions: { moveTo: "Passer à" },
    statuses: { DRAFT: "Brouillon", PENDING_APPROVAL: "En approbation", SENT: "Envoyée", PARTIALLY_RECEIVED: "Partiellement reçue", RECEIVED: "Reçue", CLOSED: "Soldée", CANCELLED: "Annulée" },
  },
  en: {
    meta: { description: "Suppliers, purchase orders and goods receipts." },
    admin: {
      title: "Purchasing", orders: "Purchase orders", suppliers: "Suppliers", receipts: "Receipts", invoices: "Supplier invoices", settings: "Settings", reorder: "Reorder", returns: "Returns", sepa: "SEPA transfers", imports: "E-invoices",
      newOrder: "New purchase order", newSupplier: "New supplier", edit: "Edit", view: "Open", back: "All purchase orders",
      empty: "No purchase orders.", noSuppliers: "No suppliers.", noReceipts: "No receipts.", listLabel: "Purchase order list",
      save: "Save", create: "Create", delete: "Delete", saved: "Saved.", created: "Created.", deleted: "Deleted.", facetStatus: "Status",
      lockedNote: "Order sent: move it back to draft to edit it.", none: "—", addLine: "Add line", removeLine: "Remove",
      receive: "Receive", receiveTitle: "Goods receipt", outstanding: "Outstanding",
      confirmDelete: "Delete permanently?", noWarehouses: "Create a warehouse and items in Logistics first.",
      newInvoice: "New invoice", issue: "Issue", pay: "Record payment", approve: "Approve", reject: "Reject",
      emptyInvoices: "No supplier invoices.", emptyReturns: "No returns.", emptySepa: "No SEPA batches.", emptyImports: "No e-invoices imported.", emptyReorder: "No reorder suggestions.",
      quality: "Quality control", landed: "Landed costs", runReorder: "Run reorder", newReturn: "New return", newRule: "New rule", exportSepa: "Export SEPA batch", upload: "Import",
      reorderMode: "Reorder mode", matching: "Matching", approval: "Purchase order approval", prefixes: "Numbering prefixes", debtor: "SEPA debtor account",
      modeOff: "Off", modeSuggestions: "Suggestions only", modeAutoDraft: "Create a draft automatically", modeAutoSend: "Create and send (trusted catalogue)",
      twoWay: "2-way (order / invoice)", threeWay: "3-way (order / receipt / invoice)", policyAccept: "Allow with variance acceptance", policyBlock: "Block issue when out of tolerance",
      approvalNone: "None", approvalThreshold: "Single threshold", approvalBands: "Amount bands",
      includeReservations: "Include reservations in available stock", autoSendTrusted: "Automatic send only to trusted catalogues",
      allowService: "Allow non-stock service lines", allowMultiWh: "Allow multiple warehouses on a purchase order", qualityRequired: "Quality control required on receipt",
      reorderHour: "Calculation hour (0-23)", toleranceAbs: "Absolute tolerance (cents)", tolerancePct: "Tolerance (%)", threshold: "Threshold (cents)", taxCategory: "Tax category",
      addBand: "Add approval band", removeBand: "Remove band", bandsHelp: "Each band stacks on top of the previous ones once the amount reaches its minimum. Bands are kept if you switch mode.",
      bandLevel: "Level", bandMin: "Minimum (minor units)", bandMax: "Maximum (minor units, empty = none)", bandRole: "Required role", bandPermission: "Permission (optional)",
      emailTemplates: "Email templates", emailPurpose: "Purpose", emailSubject: "Subject", emailBody: "Body", emailTemplatesHelp: "Per-locale override; the default template is used otherwise. Placeholders: {number}, {title}, {supplierName}.",
      addTemplate: "Add template",
      prefixPo: "PO prefix", prefixReceipt: "Receipt prefix", prefixInvoice: "Invoice prefix", prefixCredit: "Credit prefix", prefixReturn: "Return prefix", prefixSepa: "SEPA prefix",
      matchingMode: "Mode", matchingPolicy: "Policy",
      roleOrgMember: "Member", roleOrgAdmin: "Administrator", roleOrgOwner: "Owner", roleAdmin: "Platform admin", roleAny: "Any role",
      purposePoSend: "Purchase order sent", purposePoReminder: "Purchase order reminder", purposeReturnNotice: "Return notice",
      bulk: { cancel: "Cancel", close: "Close" },
    },
    fields: {
      number: "PO number", title: "Title", status: "Status", supplier: "Supplier", warehouse: "Receiving warehouse", currency: "Currency", expectedDate: "Expected delivery", notes: "Notes",
      net: "Net total", sentAt: "Sent on", lines: "Lines", sku: "SKU", description: "Description", quantity: "Quantity", unitPrice: "Unit price (net)", received: "Received",
      code: "Code", name: "Name", email: "Email", country: "Country (ISO)", vatNumber: "VAT number", address: "Address", paymentTermDays: "Payment terms (days)", active: "Active",
      supplierReference: "Supplier delivery note ref.", receivedAt: "Received on",
      iban: "IBAN", bic: "BIC", debtorName: "Debtor name", supplierInvoiceNumber: "Supplier invoice no.", dueDate: "Due date", amount: "Amount", method: "Method", paidAt: "Paid on", reference: "Reference", match: "Matching",
      kind: "Type", stock: "Stock", service: "Service", lineWarehouse: "Line warehouse",
      crmCompanyId: "CRM company", crmContactId: "CRM contact", trustedCatalogue: "Trusted catalogue (auto-send allowed)",
      punchout: "Punch-out", punchoutEnabled: "Enable punch-out", punchoutSetupUrl: "Punch-out setup URL",
      punchoutIdentity: "Punch-out identity", punchoutDomain: "Punch-out domain", punchoutSecret: "Punch-out secret",
      keepSecret: "Leave blank to keep the current secret.", sepaName: "SEPA name",

    },
    actions: { moveTo: "Move to" },
    statuses: { DRAFT: "Draft", PENDING_APPROVAL: "Pending approval", SENT: "Sent", PARTIALLY_RECEIVED: "Partially received", RECEIVED: "Received", CLOSED: "Closed", CANCELLED: "Cancelled" },
  },
  es: {
    meta: { description: "Proveedores, pedidos de compra y recepciones de mercancía." },
    admin: {
      title: "Compras", orders: "Pedidos de compra", suppliers: "Proveedores", receipts: "Recepciones", invoices: "Facturas de proveedor", settings: "Ajustes", reorder: "Reposición", returns: "Devoluciones", sepa: "Transferencias SEPA", imports: "Facturas electrónicas",
      newOrder: "Nuevo pedido de compra", newSupplier: "Nuevo proveedor", edit: "Editar", view: "Abrir", back: "Todos los pedidos",
      empty: "No hay pedidos de compra.", noSuppliers: "No hay proveedores.", noReceipts: "No hay recepciones.", listLabel: "Lista de pedidos de compra",
      save: "Guardar", create: "Crear", delete: "Eliminar", saved: "Guardado.", created: "Creado.", deleted: "Eliminado.", facetStatus: "Estado",
      lockedNote: "Pedido enviado: vuelva a borrador para editarlo.", none: "—", addLine: "Añadir línea", removeLine: "Quitar",
      receive: "Recepcionar", receiveTitle: "Recepción de mercancía", outstanding: "Pendiente",
      confirmDelete: "¿Eliminar definitivamente?", noWarehouses: "Cree primero un almacén y artículos en Logística.",
      newInvoice: "Nueva factura", issue: "Emitir", pay: "Registrar un pago", approve: "Aprobar", reject: "Rechazar",
      emptyInvoices: "No hay facturas de proveedor.", emptyReturns: "No hay devoluciones.", emptySepa: "No hay lotes SEPA.", emptyImports: "No hay facturas electrónicas importadas.", emptyReorder: "No hay sugerencias de reposición.",
      quality: "Control de calidad", landed: "Costes de acercamiento", runReorder: "Calcular la reposición", newReturn: "Nueva devolución", newRule: "Nueva regla", exportSepa: "Exportar lote SEPA", upload: "Importar",
      reorderMode: "Modo de reposición", matching: "Conciliación", approval: "Aprobación de pedidos", prefixes: "Prefijos de numeración", debtor: "Cuenta deudora SEPA",
      modeOff: "Desactivado", modeSuggestions: "Solo sugerencias", modeAutoDraft: "Crear un borrador automáticamente", modeAutoSend: "Crear y enviar (catálogo de confianza)",
      twoWay: "2 vías (pedido / factura)", threeWay: "3 vías (pedido / recepción / factura)", policyAccept: "Permitir con aceptación de desvíos", policyBlock: "Bloquear la emisión fuera de tolerancia",
      approvalNone: "Ninguna", approvalThreshold: "Umbral único", approvalBands: "Tramos por importe",
      includeReservations: "Incluir las reservas en el disponible", autoSendTrusted: "Envío automático solo a catálogos de confianza",
      allowService: "Permitir líneas de servicio (sin stock)", allowMultiWh: "Permitir varios almacenes en un pedido", qualityRequired: "Control de calidad obligatorio en la recepción",
      reorderHour: "Hora del cálculo (0-23)", toleranceAbs: "Tolerancia absoluta (céntimos)", tolerancePct: "Tolerancia (%)", threshold: "Umbral (céntimos)", taxCategory: "Categoría fiscal",
      addBand: "Añadir tramo", removeBand: "Quitar tramo", bandsHelp: "Cada tramo se suma a los anteriores cuando el importe alcanza su mínimo. Los tramos se conservan si cambia de modo.",
      bandLevel: "Nivel", bandMin: "Mínimo (céntimos)", bandMax: "Máximo (céntimos, vacío = ninguno)", bandRole: "Rol requerido", bandPermission: "Permiso (opcional)",
      emailTemplates: "Plantillas de correo", emailPurpose: "Uso", emailSubject: "Asunto", emailBody: "Cuerpo", emailTemplatesHelp: "Sustitución por idioma; si no hay, se usa la plantilla por defecto. Marcadores: {number}, {title}, {supplierName}.",
      addTemplate: "Añadir plantilla",
      prefixPo: "Prefijo de pedido", prefixReceipt: "Prefijo de recepción", prefixInvoice: "Prefijo de factura", prefixCredit: "Prefijo de abono", prefixReturn: "Prefijo de devolución", prefixSepa: "Prefijo SEPA",
      matchingMode: "Modo", matchingPolicy: "Política",
      roleOrgMember: "Miembro", roleOrgAdmin: "Administrador", roleOrgOwner: "Propietario", roleAdmin: "Administrador de plataforma", roleAny: "Cualquier rol",
      purposePoSend: "Envío del pedido", purposePoReminder: "Recordatorio de pedido", purposeReturnNotice: "Aviso de devolución",
      bulk: { cancel: "Cancelar", close: "Cerrar" },
    },
    fields: {
      number: "N.º de pedido", title: "Título", status: "Estado", supplier: "Proveedor", warehouse: "Almacén de recepción", currency: "Moneda", expectedDate: "Entrega prevista", notes: "Notas",
      net: "Total neto", sentAt: "Enviado el", lines: "Líneas", sku: "SKU", description: "Descripción", quantity: "Cantidad", unitPrice: "Precio unitario (neto)", received: "Recibido",
      code: "Código", name: "Nombre", email: "Correo", country: "País (ISO)", vatNumber: "N.º de IVA", address: "Dirección", paymentTermDays: "Plazo de pago (días)", active: "Activo",
      supplierReference: "Ref. albarán del proveedor", receivedAt: "Recibido el",
      iban: "IBAN", bic: "BIC", debtorName: "Nombre del deudor", supplierInvoiceNumber: "N.º factura del proveedor", dueDate: "Vencimiento", amount: "Importe", method: "Medio", paidAt: "Pagado el", reference: "Referencia", match: "Conciliación",
      kind: "Tipo", stock: "Stock", service: "Servicio", lineWarehouse: "Almacén de la línea",
      crmCompanyId: "Empresa CRM", crmContactId: "Contacto CRM", trustedCatalogue: "Catálogo de confianza (envío automático autorizado)",
      punchout: "Punch-out", punchoutEnabled: "Activar punch-out", punchoutSetupUrl: "URL de setup punch-out",
      punchoutIdentity: "Identidad punch-out", punchoutDomain: "Dominio punch-out", punchoutSecret: "Secreto punch-out",
      keepSecret: "Dejar vacío para conservar el secreto actual.", sepaName: "Nombre SEPA",

    },
    actions: { moveTo: "Pasar a" },
    statuses: { DRAFT: "Borrador", PENDING_APPROVAL: "Pendiente de aprobación", SENT: "Enviado", PARTIALLY_RECEIVED: "Recibido parcialmente", RECEIVED: "Recibido", CLOSED: "Cerrado", CANCELLED: "Cancelado" },
  },
  ar: {
    meta: { description: "الموردون وأوامر الشراء واستلام البضائع." },
    admin: {
      title: "المشتريات", orders: "أوامر الشراء", suppliers: "الموردون", receipts: "الاستلامات", invoices: "فواتير المورد", settings: "الإعدادات", reorder: "إعادة التوريد", returns: "المرتجعات", sepa: "تحويلات SEPA", imports: "الفواتير الإلكترونية",
      newOrder: "أمر شراء جديد", newSupplier: "مورد جديد", edit: "تعديل", view: "فتح", back: "كل أوامر الشراء",
      empty: "لا توجد أوامر شراء.", noSuppliers: "لا يوجد موردون.", noReceipts: "لا توجد استلامات.", listLabel: "قائمة أوامر الشراء",
      save: "حفظ", create: "إنشاء", delete: "حذف", saved: "تم الحفظ.", created: "تم الإنشاء.", deleted: "تم الحذف.", facetStatus: "الحالة",
      lockedNote: "تم إرسال الأمر: أعده إلى مسودة لتعديله.", none: "—", addLine: "إضافة سطر", removeLine: "إزالة",
      receive: "استلام", receiveTitle: "استلام البضائع", outstanding: "المتبقي",
      confirmDelete: "حذف نهائيًا؟", noWarehouses: "أنشئ أولًا مستودعًا وأصنافًا في الخدمات اللوجستية.",
      newInvoice: "فاتورة جديدة", issue: "إصدار", pay: "تسجيل دفعة", approve: "موافقة", reject: "رفض",
      emptyInvoices: "لا توجد فواتير مورد.", emptyReturns: "لا توجد مرتجعات.", emptySepa: "لا توجد دفعات SEPA.", emptyImports: "لا توجد فواتير إلكترونية مستوردة.", emptyReorder: "لا توجد اقتراحات إعادة توريد.",
      quality: "مراقبة الجودة", landed: "تكاليف الاقتراب", runReorder: "حساب إعادة التوريد", newReturn: "مرتجع جديد", newRule: "قاعدة جديدة", exportSepa: "تصدير دفعة SEPA", upload: "استيراد",
      reorderMode: "وضع إعادة التوريد", matching: "المطابقة", approval: "اعتماد أوامر الشراء", prefixes: "بادئات الترقيم", debtor: "حساب المدين SEPA",
      modeOff: "إيقاف", modeSuggestions: "اقتراحات فقط", modeAutoDraft: "إنشاء مسودة تلقائيًا", modeAutoSend: "إنشاء وإرسال (كتالوج موثوق)",
      twoWay: "مساران (أمر / فاتورة)", threeWay: "ثلاثة مسارات (أمر / استلام / فاتورة)", policyAccept: "السماح مع قبول الفروقات", policyBlock: "حظر الإصدار خارج التسامح",
      approvalNone: "بدون", approvalThreshold: "عتبة واحدة", approvalBands: "شرائح حسب المبلغ",
      includeReservations: "تضمين الحجوزات في المتاح", autoSendTrusted: "الإرسال التلقائي فقط للكتالوج الموثوق",
      allowService: "السماح ببنود الخدمات (خارج المخزون)", allowMultiWh: "السماح بعدة مستودعات في أمر شراء واحد", qualityRequired: "مراقبة جودة إلزامية عند الاستلام",
      reorderHour: "ساعة الحساب (0-23)", toleranceAbs: "التسامح المطلق (سنتات)", tolerancePct: "التسامح (%)", threshold: "العتبة (سنتات)", taxCategory: "فئة الضريبة",
      addBand: "إضافة شريحة", removeBand: "حذف الشريحة", bandsHelp: "تُضاف كل شريحة إلى الشرائح السابقة عندما يبلغ المبلغ حدها الأدنى. تُحفظ الشرائح عند تغيير الوضع.",
      bandLevel: "المستوى", bandMin: "الحد الأدنى (وحدات صغرى)", bandMax: "الحد الأعلى (وحدات صغرى، فارغ = دون حد)", bandRole: "الدور المطلوب", bandPermission: "الصلاحية (اختياري)",
      emailTemplates: "قوالب البريد", emailPurpose: "الغرض", emailSubject: "الموضوع", emailBody: "النص", emailTemplatesHelp: "تجاوز حسب اللغة؛ وإلا يُستخدم القالب الافتراضي. العناصر النائبة: {number}، {title}، {supplierName}.",
      addTemplate: "إضافة قالب",
      prefixPo: "بادئة أمر الشراء", prefixReceipt: "بادئة الإيصال", prefixInvoice: "بادئة الفاتورة", prefixCredit: "بادئة الإشعار الدائن", prefixReturn: "بادئة المرتجع", prefixSepa: "بادئة SEPA",
      matchingMode: "الوضع", matchingPolicy: "السياسة",
      roleOrgMember: "عضو", roleOrgAdmin: "مسؤول", roleOrgOwner: "مالك", roleAdmin: "مسؤول المنصة", roleAny: "أي دور",
      purposePoSend: "إرسال أمر الشراء", purposePoReminder: "تذكير أمر الشراء", purposeReturnNotice: "إشعار مرتجع",
      bulk: { cancel: "إلغاء", close: "إقفال" },
    },
    fields: {
      number: "رقم أمر الشراء", title: "العنوان", status: "الحالة", supplier: "المورد", warehouse: "مستودع الاستلام", currency: "العملة", expectedDate: "التسليم المتوقع", notes: "ملاحظات",
      net: "الإجمالي الصافي", sentAt: "أُرسل في", lines: "الأسطر", sku: "SKU", description: "الوصف", quantity: "الكمية", unitPrice: "سعر الوحدة (صافٍ)", received: "المستلَم",
      code: "الرمز", name: "الاسم", email: "البريد الإلكتروني", country: "البلد (ISO)", vatNumber: "الرقم الضريبي", address: "العنوان", paymentTermDays: "مهلة الدفع (أيام)", active: "نشط",
      supplierReference: "مرجع إيصال تسليم المورد", receivedAt: "استُلم في",
      iban: "IBAN", bic: "BIC", debtorName: "اسم المدين", supplierInvoiceNumber: "رقم فاتورة المورد", dueDate: "تاريخ الاستحقاق", amount: "المبلغ", method: "الوسيلة", paidAt: "دُفع في", reference: "المرجع", match: "المطابقة",
      kind: "النوع", stock: "مخزون", service: "خدمة", lineWarehouse: "مستودع السطر",
      crmCompanyId: "شركة CRM", crmContactId: "جهة اتصال CRM", trustedCatalogue: "كتالوج موثوق (يُسمح بالإرسال التلقائي)",
      punchout: "Punch-out", punchoutEnabled: "تفعيل الـ punch-out", punchoutSetupUrl: "عنوان إعداد الـ punch-out",
      punchoutIdentity: "هوية الـ punch-out", punchoutDomain: "نطاق الـ punch-out", punchoutSecret: "سر الـ punch-out",
      keepSecret: "اتركه فارغًا للاحتفاظ بالسر الحالي.", sepaName: "اسم SEPA",

    },
    actions: { moveTo: "نقل إلى" },
    statuses: { DRAFT: "مسودة", PENDING_APPROVAL: "بانتظار الموافقة", SENT: "مُرسَل", PARTIALLY_RECEIVED: "مستلَم جزئيًا", RECEIVED: "مستلَم", CLOSED: "مُقفَل", CANCELLED: "ملغى" },
  },
};

export function getPurchasingTranslations(locale: Locale): PurchasingTranslations {
  return translations[locale];
}
