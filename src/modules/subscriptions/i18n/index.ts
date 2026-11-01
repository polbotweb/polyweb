/** Libellés du module subscriptions : back-office, catalogue public, portail client (4 locales). */
import type { Locale } from "@i18n/config";
import type { SupplyType, TaxCategory } from "@/modules/tax/domain/rules";
import type { BillingInterval, SubscriptionStatus } from "../domain/lifecycle";

export type SubscriptionsTranslations = {
  meta: { description: string; publicTitle: string; publicDescription: string };
  admin: {
    title: string; plans: string; subscriptions: string; newPlan: string; editPlan: string; prices: string; newPrice: string;
    open: string; back: string; noPlans: string; noPrices: string; noSubscriptions: string; plansLabel: string; subscriptionsLabel: string;
    save: string; create: string; saved: string; created: string; activate: string; deactivate: string;
    cancel: string; resume: string; confirmCancel: string; changePrice: string; prorate: string; apply: string; detail: string; invoicesNote: string;
  };
  fields: {
    slug: string; name: string; description: string; taxCategory: string; supplyType: string; active: string; sortOrder: string;
    currency: string; amount: string; interval: string; intervalCount: string; trialDays: string;
    plan: string; price: string; status: string; customer: string; email: string; country: string; periodEnd: string; cancelAtPeriodEnd: string; provider: string; created: string;
  };
  public: { heading: string; intro: string; empty: string; subscribe: string; country: string; loginToSubscribe: string; trial: string; success: string; cancelled: string; error: string };
  portal: { heading: string; empty: string; cancel: string; resume: string; endsOn: string; renewsOn: string; browse: string };
  every: (count: number, interval: BillingInterval) => string;
  statuses: Record<SubscriptionStatus, string>;
  taxCategories: Record<TaxCategory, string>;
  supplyTypes: Record<SupplyType, string>;
};

const intervalsFr: Record<BillingInterval, [string, string]> = { day: ["jour", "jours"], week: ["semaine", "semaines"], month: ["mois", "mois"], year: ["an", "ans"] };
const intervalsEn: Record<BillingInterval, [string, string]> = { day: ["day", "days"], week: ["week", "weeks"], month: ["month", "months"], year: ["year", "years"] };
const intervalsEs: Record<BillingInterval, [string, string]> = { day: ["día", "días"], week: ["semana", "semanas"], month: ["mes", "meses"], year: ["año", "años"] };
const intervalsAr: Record<BillingInterval, [string, string]> = { day: ["يوم", "أيام"], week: ["أسبوع", "أسابيع"], month: ["شهر", "أشهر"], year: ["سنة", "سنوات"] };

const translations: Record<Locale, SubscriptionsTranslations> = {
  fr: {
    meta: { description: "Formules d'abonnement, tarifs récurrents et abonnements clients.", publicTitle: "Abonnements", publicDescription: "Nos formules d'abonnement et leurs tarifs." },
    admin: {
      title: "Abonnements", plans: "Formules", subscriptions: "Abonnements clients", newPlan: "Nouvelle formule", editPlan: "Modifier la formule", prices: "Tarifs", newPrice: "Nouveau tarif",
      open: "Ouvrir", back: "Tous les abonnements", noPlans: "Aucune formule.", noPrices: "Aucun tarif.", noSubscriptions: "Aucun abonnement.", plansLabel: "Liste des formules", subscriptionsLabel: "Liste des abonnements",
      save: "Enregistrer", create: "Créer", saved: "Enregistré.", created: "Créé.", activate: "Activer", deactivate: "Désactiver",
      cancel: "Résilier en fin de période", resume: "Reprendre", confirmCancel: "Résilier cet abonnement en fin de période ?", changePrice: "Changer de tarif", prorate: "Facturer au prorata", apply: "Appliquer", detail: "Abonnement",
      invoicesNote: "Chaque période payée produit une facture dans Ventes (référence de la facture fournisseur) ; les relances suivent les factures impayées.",
    },
    fields: {
      slug: "Identifiant (slug)", name: "Nom", description: "Description", taxCategory: "Catégorie de TVA", supplyType: "Type de prestation", active: "Active", sortOrder: "Ordre",
      currency: "Devise", amount: "Montant TTC", interval: "Période", intervalCount: "Nombre de périodes", trialDays: "Jours d'essai",
      plan: "Formule", price: "Tarif", status: "Statut", customer: "Client", email: "E-mail", country: "Pays (ISO)", periodEnd: "Fin de période", cancelAtPeriodEnd: "Résiliation programmée", provider: "Fournisseur", created: "Créé le",
    },
    public: { heading: "Nos abonnements", intro: "Choisissez une formule ; le paiement récurrent est géré par notre prestataire de paiement.", empty: "Aucune formule disponible pour le moment.", subscribe: "S'abonner", country: "Pays de résidence (ISO, ex. FR)", loginToSubscribe: "Connectez-vous pour vous abonner", trial: "jours d'essai", success: "Merci ! Votre abonnement sera actif dès confirmation du paiement.", cancelled: "Souscription abandonnée.", error: "La souscription n'a pas pu démarrer." },
    portal: { heading: "Mes abonnements", empty: "Aucun abonnement.", cancel: "Résilier en fin de période", resume: "Reprendre l'abonnement", endsOn: "Se termine le", renewsOn: "Se renouvelle le", browse: "Voir les formules" },
    every: (count, interval) => `/ ${count > 1 ? `${count} ` : ""}${intervalsFr[interval][count > 1 ? 1 : 0]}`,
    statuses: { incomplete: "En attente de paiement", trialing: "Essai", active: "Actif", past_due: "Paiement en retard", cancelled: "Résilié", unpaid: "Impayé", paused: "Suspendu" },
    taxCategories: { standard: "Taux normal", reduced: "Taux réduit", "reduced-2": "Taux intermédiaire", "super-reduced": "Taux super réduit", zero: "Taux zéro", exempt: "Exonéré" },
    supplyTypes: { goods: "Biens", services: "Services" },
  },
  en: {
    meta: { description: "Subscription plans, recurring prices and customer subscriptions.", publicTitle: "Subscriptions", publicDescription: "Our subscription plans and prices." },
    admin: {
      title: "Subscriptions", plans: "Plans", subscriptions: "Customer subscriptions", newPlan: "New plan", editPlan: "Edit plan", prices: "Prices", newPrice: "New price",
      open: "Open", back: "All subscriptions", noPlans: "No plans.", noPrices: "No prices.", noSubscriptions: "No subscriptions.", plansLabel: "Plan list", subscriptionsLabel: "Subscription list",
      save: "Save", create: "Create", saved: "Saved.", created: "Created.", activate: "Activate", deactivate: "Deactivate",
      cancel: "Cancel at period end", resume: "Resume", confirmCancel: "Cancel this subscription at the end of the period?", changePrice: "Change price", prorate: "Prorate", apply: "Apply", detail: "Subscription",
      invoicesNote: "Each paid period creates an invoice in Sales (referencing the provider invoice); reminders follow unpaid invoices.",
    },
    fields: {
      slug: "Identifier (slug)", name: "Name", description: "Description", taxCategory: "VAT category", supplyType: "Supply type", active: "Active", sortOrder: "Order",
      currency: "Currency", amount: "Amount incl. VAT", interval: "Period", intervalCount: "Number of periods", trialDays: "Trial days",
      plan: "Plan", price: "Price", status: "Status", customer: "Customer", email: "Email", country: "Country (ISO)", periodEnd: "Period end", cancelAtPeriodEnd: "Cancellation scheduled", provider: "Provider", created: "Created",
    },
    public: { heading: "Our subscriptions", intro: "Pick a plan; recurring payment is handled by our payment provider.", empty: "No plans available yet.", subscribe: "Subscribe", country: "Country of residence (ISO, e.g. FR)", loginToSubscribe: "Sign in to subscribe", trial: "trial days", success: "Thank you! Your subscription will be active once payment is confirmed.", cancelled: "Subscription abandoned.", error: "The subscription could not be started." },
    portal: { heading: "My subscriptions", empty: "No subscriptions.", cancel: "Cancel at period end", resume: "Resume subscription", endsOn: "Ends on", renewsOn: "Renews on", browse: "See plans" },
    every: (count, interval) => `/ ${count > 1 ? `${count} ` : ""}${intervalsEn[interval][count > 1 ? 1 : 0]}`,
    statuses: { incomplete: "Awaiting payment", trialing: "Trial", active: "Active", past_due: "Past due", cancelled: "Cancelled", unpaid: "Unpaid", paused: "Paused" },
    taxCategories: { standard: "Standard rate", reduced: "Reduced rate", "reduced-2": "Intermediate rate", "super-reduced": "Super-reduced rate", zero: "Zero rate", exempt: "Exempt" },
    supplyTypes: { goods: "Goods", services: "Services" },
  },
  es: {
    meta: { description: "Planes de suscripción, precios recurrentes y suscripciones de clientes.", publicTitle: "Suscripciones", publicDescription: "Nuestros planes de suscripción y sus precios." },
    admin: {
      title: "Suscripciones", plans: "Planes", subscriptions: "Suscripciones de clientes", newPlan: "Nuevo plan", editPlan: "Editar plan", prices: "Precios", newPrice: "Nuevo precio",
      open: "Abrir", back: "Todas las suscripciones", noPlans: "Ningún plan.", noPrices: "Ningún precio.", noSubscriptions: "Ninguna suscripción.", plansLabel: "Lista de planes", subscriptionsLabel: "Lista de suscripciones",
      save: "Guardar", create: "Crear", saved: "Guardado.", created: "Creado.", activate: "Activar", deactivate: "Desactivar",
      cancel: "Cancelar al final del periodo", resume: "Reanudar", confirmCancel: "¿Cancelar esta suscripción al final del periodo?", changePrice: "Cambiar de precio", prorate: "Prorratear", apply: "Aplicar", detail: "Suscripción",
      invoicesNote: "Cada periodo pagado genera una factura en Ventas (con la referencia de la factura del proveedor); los recordatorios siguen las facturas impagadas.",
    },
    fields: {
      slug: "Identificador (slug)", name: "Nombre", description: "Descripción", taxCategory: "Categoría de IVA", supplyType: "Tipo de prestación", active: "Activo", sortOrder: "Orden",
      currency: "Moneda", amount: "Importe IVA incl.", interval: "Periodo", intervalCount: "Número de periodos", trialDays: "Días de prueba",
      plan: "Plan", price: "Precio", status: "Estado", customer: "Cliente", email: "Correo electrónico", country: "País (ISO)", periodEnd: "Fin del periodo", cancelAtPeriodEnd: "Cancelación programada", provider: "Proveedor", created: "Creado el",
    },
    public: { heading: "Nuestras suscripciones", intro: "Elija un plan; el pago recurrente lo gestiona nuestro proveedor de pagos.", empty: "Aún no hay planes disponibles.", subscribe: "Suscribirse", country: "País de residencia (ISO, p. ej. ES)", loginToSubscribe: "Inicie sesión para suscribirse", trial: "días de prueba", success: "¡Gracias! Su suscripción se activará al confirmarse el pago.", cancelled: "Suscripción abandonada.", error: "No se pudo iniciar la suscripción." },
    portal: { heading: "Mis suscripciones", empty: "Ninguna suscripción.", cancel: "Cancelar al final del periodo", resume: "Reanudar la suscripción", endsOn: "Termina el", renewsOn: "Se renueva el", browse: "Ver los planes" },
    every: (count, interval) => `/ ${count > 1 ? `${count} ` : ""}${intervalsEs[interval][count > 1 ? 1 : 0]}`,
    statuses: { incomplete: "Pendiente de pago", trialing: "Prueba", active: "Activa", past_due: "Pago atrasado", cancelled: "Cancelada", unpaid: "Impagada", paused: "Pausada" },
    taxCategories: { standard: "Tipo general", reduced: "Tipo reducido", "reduced-2": "Tipo intermedio", "super-reduced": "Tipo superreducido", zero: "Tipo cero", exempt: "Exento" },
    supplyTypes: { goods: "Bienes", services: "Servicios" },
  },
  ar: {
    meta: { description: "خطط الاشتراك والأسعار المتكررة واشتراكات العملاء.", publicTitle: "الاشتراكات", publicDescription: "خطط الاشتراك لدينا وأسعارها." },
    admin: {
      title: "الاشتراكات", plans: "الخطط", subscriptions: "اشتراكات العملاء", newPlan: "خطة جديدة", editPlan: "تعديل الخطة", prices: "الأسعار", newPrice: "سعر جديد",
      open: "فتح", back: "كل الاشتراكات", noPlans: "لا توجد خطط.", noPrices: "لا توجد أسعار.", noSubscriptions: "لا توجد اشتراكات.", plansLabel: "قائمة الخطط", subscriptionsLabel: "قائمة الاشتراكات",
      save: "حفظ", create: "إنشاء", saved: "تم الحفظ.", created: "تم الإنشاء.", activate: "تفعيل", deactivate: "تعطيل",
      cancel: "إلغاء في نهاية الفترة", resume: "استئناف", confirmCancel: "إلغاء هذا الاشتراك في نهاية الفترة؟", changePrice: "تغيير السعر", prorate: "الفوترة التناسبية", apply: "تطبيق", detail: "الاشتراك",
      invoicesNote: "كل فترة مدفوعة تُنشئ فاتورة في المبيعات (بمرجع فاتورة مزوّد الدفع)؛ وتتبع التذكيرات الفواتير غير المدفوعة.",
    },
    fields: {
      slug: "المعرّف (slug)", name: "الاسم", description: "الوصف", taxCategory: "فئة الضريبة", supplyType: "نوع التوريد", active: "نشطة", sortOrder: "الترتيب",
      currency: "العملة", amount: "المبلغ شامل الضريبة", interval: "الفترة", intervalCount: "عدد الفترات", trialDays: "أيام التجربة",
      plan: "الخطة", price: "السعر", status: "الحالة", customer: "العميل", email: "البريد الإلكتروني", country: "البلد (ISO)", periodEnd: "نهاية الفترة", cancelAtPeriodEnd: "إلغاء مجدول", provider: "المزوّد", created: "أُنشئ في",
    },
    public: { heading: "اشتراكاتنا", intro: "اختر خطة؛ يتولى مزوّد الدفع لدينا الدفع المتكرر.", empty: "لا توجد خطط متاحة حاليًا.", subscribe: "اشترك", country: "بلد الإقامة (ISO، مثل FR)", loginToSubscribe: "سجّل الدخول للاشتراك", trial: "أيام تجربة", success: "شكرًا! سيصبح اشتراكك نشطًا بعد تأكيد الدفع.", cancelled: "تم التخلي عن الاشتراك.", error: "تعذّر بدء الاشتراك." },
    portal: { heading: "اشتراكاتي", empty: "لا توجد اشتراكات.", cancel: "إلغاء في نهاية الفترة", resume: "استئناف الاشتراك", endsOn: "ينتهي في", renewsOn: "يتجدد في", browse: "عرض الخطط" },
    every: (count, interval) => `/ ${count > 1 ? `${count} ` : ""}${intervalsAr[interval][count > 1 ? 1 : 0]}`,
    statuses: { incomplete: "بانتظار الدفع", trialing: "تجربة", active: "نشط", past_due: "دفع متأخر", cancelled: "ملغى", unpaid: "غير مدفوع", paused: "موقوف" },
    taxCategories: { standard: "المعدل العادي", reduced: "المعدل المخفّض", "reduced-2": "المعدل المتوسط", "super-reduced": "المعدل المخفّض جدًا", zero: "معدل صفري", exempt: "معفى" },
    supplyTypes: { goods: "سلع", services: "خدمات" },
  },
};

export function getSubscriptionsTranslations(locale: Locale): SubscriptionsTranslations {
  return translations[locale];
}
