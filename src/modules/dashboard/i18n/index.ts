/** Libellés du tableau de bord ERP, 4 locales. */
import type { Locale } from "@i18n/config";
import type { Granularity, DashboardFilterError } from "../domain/period";

export interface DashboardTranslations {
  title: string; intro: string; filters: string; from: string; to: string; granularity: string; granularities: Record<Granularity, string>;
  currency: string; currencyHint: string; threshold: string; thresholdHint: string; apply: string; reset: string;
  errors: Record<DashboardFilterError, string>; unavailable: string;
  summary: string; revenueNet: string; revenueGross: string; paid: string; outstanding: string; overdue: string; openInvoices: string; pendingOrders: string;
  grossMargin: string; shopMargin: string; rate: string; noRate: string; quarter: string;
  revenueTable: string; period: string; invoiced: string; credited: string; shop: string; purchases: string; total: string;
  uncostedUnits: string; method: string;
  stock: string; stockValuation: string; units: string; reserved: string; items: string; lowTitle: string; noLow: string;
  sku: string; name: string; level: string; available: string; unitCost: string; valuation: string; uncostedItems: string; truncated: string;
}

const fr: DashboardTranslations = {
  title: "Tableau de bord", intro: "Chiffre d’affaires, encaissements, marges et stock du back-office plateforme.",
  filters: "Filtres", from: "Du", to: "Au", granularity: "Regroupement", granularities: { month: "Par mois", quarter: "Par trimestre", year: "Par année" },
  currency: "Devise", currencyHint: "Code ISO 4217, ex. EUR.", threshold: "Seuil de stock bas", thresholdHint: "Alerte quand le disponible est inférieur ou égal au seuil.",
  apply: "Afficher", reset: "Réinitialiser",
  errors: { invalidDate: "Date invalide (AAAA-MM-JJ) : valeur par défaut utilisée.", invalidRange: "Période invalide ou trop longue : année en cours affichée.", invalidCurrency: "Devise inconnue : EUR affiché.", invalidThreshold: "Seuil invalide (entier de 0 à 100 000) : valeur par défaut utilisée." },
  unavailable: "Les indicateurs sont momentanément indisponibles. Réessayez plus tard.",
  summary: "Synthèse de la période", revenueNet: "CA HT", revenueGross: "CA TTC", paid: "Encaissé TTC", outstanding: "Encours clients TTC (à date)", overdue: "Dont échu",
  openInvoices: "{n} facture(s) ouverte(s), dont {m} échue(s).", pendingOrders: "{n} commande(s) boutique en attente de paiement.",
  grossMargin: "Marge brute approchée", shopMargin: "Marge boutique", rate: "Taux : {rate}", noRate: "Taux : non calculable", quarter: "T{q} {y}",
  revenueTable: "Chiffre d’affaires, encaissements et marges par période", period: "Période", invoiced: "Facturé HT", credited: "Avoirs HT", shop: "Boutique HT",
  purchases: "Achats reçus HT", total: "Total",
  uncostedUnits: "{n} unité(s) vendue(s) en boutique sans coût d’achat connu : la marge boutique est surestimée d’autant.",
  method: "Montants en {currency}, jours UTC. Factures à la date d’émission (avoirs déduits), commandes boutique à la date de paiement ; une commande liée à une facture n’est comptée qu’une fois, via la facture. Marge brute approchée = CA HT − achats reçus HT de la période.",
  stock: "Stock", stockValuation: "Valeur du stock (coût moyen pondéré)", units: "Unités en stock", reserved: "Unités réservées", items: "Articles",
  lowTitle: "Alertes de stock bas (disponible ≤ {n})", noLow: "Aucun article sous le seuil.", sku: "SKU", name: "Article", level: "Niveau", available: "Disponible",
  unitCost: "Coût moyen", valuation: "Valeur", uncostedItems: "{n} article(s) en stock sans coût d’achat dans cette devise (non valorisés).",
  truncated: "Liste limitée aux {n} premiers articles : totaux partiels.",
};
const en: DashboardTranslations = {
  title: "Dashboard", intro: "Revenue, payments, margins and stock for the platform back office.",
  filters: "Filters", from: "From", to: "To", granularity: "Group by", granularities: { month: "Month", quarter: "Quarter", year: "Year" },
  currency: "Currency", currencyHint: "ISO 4217 code, e.g. EUR.", threshold: "Low-stock threshold", thresholdHint: "Alert when available stock is at or below the threshold.",
  apply: "Show", reset: "Reset",
  errors: { invalidDate: "Invalid date (YYYY-MM-DD): default used.", invalidRange: "Invalid or too long period: current year shown.", invalidCurrency: "Unknown currency: EUR shown.", invalidThreshold: "Invalid threshold (integer from 0 to 100,000): default used." },
  unavailable: "Indicators are temporarily unavailable. Please try again later.",
  summary: "Period summary", revenueNet: "Revenue excl. VAT", revenueGross: "Revenue incl. VAT", paid: "Collected incl. VAT", outstanding: "Receivables incl. VAT (today)", overdue: "Of which overdue",
  openInvoices: "{n} open invoice(s), {m} overdue.", pendingOrders: "{n} shop order(s) awaiting payment.",
  grossMargin: "Approximate gross margin", shopMargin: "Shop margin", rate: "Rate: {rate}", noRate: "Rate: not available", quarter: "Q{q} {y}",
  revenueTable: "Revenue, payments and margins by period", period: "Period", invoiced: "Invoiced excl. VAT", credited: "Credit notes excl. VAT", shop: "Shop excl. VAT",
  purchases: "Purchases received excl. VAT", total: "Total",
  uncostedUnits: "{n} unit(s) sold in the shop without a known purchase cost: the shop margin is overstated accordingly.",
  method: "Amounts in {currency}, UTC days. Invoices by issue date (credit notes deducted), shop orders by payment date; an order linked to an invoice is counted once, through the invoice. Approximate gross margin = revenue excl. VAT − purchases received excl. VAT in the period.",
  stock: "Stock", stockValuation: "Stock value (weighted average cost)", units: "Units in stock", reserved: "Reserved units", items: "Items",
  lowTitle: "Low-stock alerts (available ≤ {n})", noLow: "No item below the threshold.", sku: "SKU", name: "Item", level: "Level", available: "Available",
  unitCost: "Average cost", valuation: "Value", uncostedItems: "{n} item(s) in stock without a purchase cost in this currency (not valued).",
  truncated: "List limited to the first {n} items: partial totals.",
};
const es: DashboardTranslations = {
  title: "Panel de control", intro: "Facturación, cobros, márgenes y stock del back-office de la plataforma.",
  filters: "Filtros", from: "Desde", to: "Hasta", granularity: "Agrupar por", granularities: { month: "Mes", quarter: "Trimestre", year: "Año" },
  currency: "Moneda", currencyHint: "Código ISO 4217, p. ej. EUR.", threshold: "Umbral de stock bajo", thresholdHint: "Alerta cuando el disponible es menor o igual al umbral.",
  apply: "Mostrar", reset: "Restablecer",
  errors: { invalidDate: "Fecha no válida (AAAA-MM-DD): se usa el valor por defecto.", invalidRange: "Periodo no válido o demasiado largo: se muestra el año en curso.", invalidCurrency: "Moneda desconocida: se muestra EUR.", invalidThreshold: "Umbral no válido (entero de 0 a 100 000): se usa el valor por defecto." },
  unavailable: "Los indicadores no están disponibles por el momento. Inténtelo más tarde.",
  summary: "Resumen del periodo", revenueNet: "Facturación sin IVA", revenueGross: "Facturación IVA incl.", paid: "Cobrado IVA incl.", outstanding: "Pendiente de cobro IVA incl. (hoy)", overdue: "Del cual vencido",
  openInvoices: "{n} factura(s) abierta(s), {m} vencida(s).", pendingOrders: "{n} pedido(s) de la tienda pendiente(s) de pago.",
  grossMargin: "Margen bruto aproximado", shopMargin: "Margen de la tienda", rate: "Tasa: {rate}", noRate: "Tasa: no calculable", quarter: "T{q} {y}",
  revenueTable: "Facturación, cobros y márgenes por periodo", period: "Periodo", invoiced: "Facturado sin IVA", credited: "Abonos sin IVA", shop: "Tienda sin IVA",
  purchases: "Compras recibidas sin IVA", total: "Total",
  uncostedUnits: "{n} unidad(es) vendida(s) en la tienda sin coste de compra conocido: el margen de la tienda está sobrestimado.",
  method: "Importes en {currency}, días UTC. Facturas por fecha de emisión (abonos deducidos), pedidos de la tienda por fecha de pago; un pedido vinculado a una factura se cuenta una sola vez, mediante la factura. Margen bruto aproximado = facturación sin IVA − compras recibidas sin IVA del periodo.",
  stock: "Stock", stockValuation: "Valor del stock (coste medio ponderado)", units: "Unidades en stock", reserved: "Unidades reservadas", items: "Artículos",
  lowTitle: "Alertas de stock bajo (disponible ≤ {n})", noLow: "Ningún artículo por debajo del umbral.", sku: "SKU", name: "Artículo", level: "Nivel", available: "Disponible",
  unitCost: "Coste medio", valuation: "Valor", uncostedItems: "{n} artículo(s) en stock sin coste de compra en esta moneda (no valorados).",
  truncated: "Lista limitada a los primeros {n} artículos: totales parciales.",
};
const ar: DashboardTranslations = {
  title: "لوحة المعلومات", intro: "رقم الأعمال والتحصيلات والهوامش والمخزون في الواجهة الإدارية للمنصة.",
  filters: "عوامل التصفية", from: "من", to: "إلى", granularity: "التجميع", granularities: { month: "حسب الشهر", quarter: "حسب الربع", year: "حسب السنة" },
  currency: "العملة", currencyHint: "رمز ISO 4217، مثل EUR.", threshold: "حد المخزون المنخفض", thresholdHint: "تنبيه عندما يكون المتاح أقل من الحد أو مساويًا له.",
  apply: "عرض", reset: "إعادة تعيين",
  errors: { invalidDate: "تاريخ غير صالح (YYYY-MM-DD): استُخدمت القيمة الافتراضية.", invalidRange: "فترة غير صالحة أو طويلة جدًا: تُعرض السنة الحالية.", invalidCurrency: "عملة غير معروفة: يُعرض EUR.", invalidThreshold: "حد غير صالح (عدد صحيح من 0 إلى 100000): استُخدمت القيمة الافتراضية." },
  unavailable: "المؤشرات غير متاحة مؤقتًا. يُرجى المحاولة لاحقًا.",
  summary: "ملخص الفترة", revenueNet: "رقم الأعمال دون ضريبة", revenueGross: "رقم الأعمال مع الضريبة", paid: "المحصَّل مع الضريبة", outstanding: "مستحقات العملاء مع الضريبة (اليوم)", overdue: "منها متأخرة",
  openInvoices: "{n} فاتورة مفتوحة، منها {m} متأخرة.", pendingOrders: "{n} طلب متجر بانتظار الدفع.",
  grossMargin: "الهامش الإجمالي التقريبي", shopMargin: "هامش المتجر", rate: "النسبة: {rate}", noRate: "النسبة: غير قابلة للحساب", quarter: "الربع {q} {y}",
  revenueTable: "رقم الأعمال والتحصيلات والهوامش حسب الفترة", period: "الفترة", invoiced: "المفوتر دون ضريبة", credited: "الإشعارات الدائنة دون ضريبة", shop: "المتجر دون ضريبة",
  purchases: "المشتريات المستلمة دون ضريبة", total: "المجموع",
  uncostedUnits: "{n} وحدة مباعة في المتجر دون تكلفة شراء معروفة: هامش المتجر مُبالغ فيه بقدرها.",
  method: "المبالغ بعملة {currency}، الأيام بتوقيت UTC. الفواتير حسب تاريخ الإصدار (بعد خصم الإشعارات الدائنة)، وطلبات المتجر حسب تاريخ الدفع؛ يُحتسب الطلب المرتبط بفاتورة مرة واحدة عبر الفاتورة. الهامش الإجمالي التقريبي = رقم الأعمال دون ضريبة − المشتريات المستلمة دون ضريبة خلال الفترة.",
  stock: "المخزون", stockValuation: "قيمة المخزون (متوسط التكلفة المرجح)", units: "الوحدات في المخزون", reserved: "الوحدات المحجوزة", items: "الأصناف",
  lowTitle: "تنبيهات المخزون المنخفض (المتاح ≤ {n})", noLow: "لا يوجد صنف دون الحد.", sku: "SKU", name: "الصنف", level: "المستوى", available: "المتاح",
  unitCost: "متوسط التكلفة", valuation: "القيمة", uncostedItems: "{n} صنف في المخزون دون تكلفة شراء بهذه العملة (غير مُقيَّم).",
  truncated: "القائمة مقصورة على أول {n} صنف: المجاميع جزئية.",
};

const translations: Record<Locale, DashboardTranslations> = { fr, en, es, ar };
export const getDashboardTranslations = (locale: Locale): DashboardTranslations => translations[locale];
