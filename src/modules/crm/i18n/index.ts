/** Libellés back-office du module crm (sociétés, contacts, opportunités, activités — 4 locales). */
import type { Locale } from "@i18n/config";
import type { ActivityKind } from "../domain/activities";
import type { CrmStage, LostReason } from "../domain/workflow";

export type CrmTranslations = {
  meta: { description: string };
  admin: {
    title: string; pipeline: string; list: string; newOpportunity: string; newCompany: string; newContact: string; edit: string; view: string; back: string;
    empty: string; listLabel: string; save: string; create: string; delete: string; saved: string; created: string; deleted: string; facetStatus: string;
    closedNote: string; companies: string; contacts: string; noCompanies: string; noContacts: string; none: string;
    bulk: { qualify: string; lose: string };
  };
  fields: {
    title: string; status: string; company: string; contact: string; owner: string; amount: string; currency: string; probability: string; expectedCloseDate: string;
    lostReason: string; quote: string; notes: string; name: string; firstName: string; lastName: string; email: string; phone: string; website: string;
    country: string; vatNumber: string; address: string; jobTitle: string; closedAt: string;
  };
  summary: { open: string; forecast: string; won: string; winRate: string; count: string };
  actions: { moveTo: string; win: string; lose: string; reopen: string; linkQuote: string; unlinkQuote: string };
  activities: { title: string; add: string; subject: string; body: string; dueAt: string; done: string; overdue: string; empty: string; kind: string; kinds: Record<ActivityKind, string> };
  stages: Record<CrmStage, string>;
  lostReasons: Record<LostReason, string>;
};

const translations: Record<Locale, CrmTranslations> = {
  fr: {
    meta: { description: "Sociétés, contacts, opportunités et activités commerciales." },
    admin: { title: "CRM", pipeline: "Pipeline", list: "Liste", newOpportunity: "Nouvelle opportunité", newCompany: "Nouvelle société", newContact: "Nouveau contact", edit: "Modifier", view: "Ouvrir", back: "Toutes les opportunités", empty: "Aucune opportunité.", listLabel: "Liste des opportunités", save: "Enregistrer", create: "Créer", delete: "Supprimer", saved: "Enregistré.", created: "Créé.", deleted: "Supprimé.", facetStatus: "Étape", closedNote: "Opportunité clôturée : rouvrez-la pour la modifier.", companies: "Sociétés", contacts: "Contacts", noCompanies: "Aucune société.", noContacts: "Aucun contact.", none: "—", bulk: { qualify: "Qualifier", lose: "Classer perdues" } },
    fields: { title: "Intitulé", status: "Étape", company: "Société", contact: "Contact", owner: "Responsable", amount: "Montant", currency: "Devise", probability: "Probabilité (%)", expectedCloseDate: "Clôture prévue", lostReason: "Motif de perte", quote: "Devis lié", notes: "Notes", name: "Nom", firstName: "Prénom", lastName: "Nom", email: "E-mail", phone: "Téléphone", website: "Site web", country: "Pays (ISO)", vatNumber: "N° de TVA", address: "Adresse", jobTitle: "Fonction", closedAt: "Clôturée le" },
    summary: { open: "En cours", forecast: "Prévision pondérée", won: "Gagné", winRate: "Taux de réussite", count: "Opportunités" },
    actions: { moveTo: "Passer à", win: "Gagnée", lose: "Perdue", reopen: "Rouvrir", linkQuote: "Lier un devis", unlinkQuote: "Délier le devis" },
    activities: { title: "Activités", add: "Ajouter une activité", subject: "Objet", body: "Détail", dueAt: "Échéance", done: "Terminée", overdue: "En retard", empty: "Aucune activité.", kind: "Type", kinds: { note: "Note", call: "Appel", email: "E-mail", meeting: "Rendez-vous", task: "Tâche" } },
    stages: { NEW: "Nouvelle", QUALIFIED: "Qualifiée", PROPOSAL: "Proposition", NEGOTIATION: "Négociation", WON: "Gagnée", LOST: "Perdue" },
    lostReasons: { price: "Prix", competitor: "Concurrent", timing: "Calendrier", no_budget: "Pas de budget", no_decision: "Pas de décision", other: "Autre" },
  },
  en: {
    meta: { description: "Companies, contacts, opportunities and sales activities." },
    admin: { title: "CRM", pipeline: "Pipeline", list: "List", newOpportunity: "New opportunity", newCompany: "New company", newContact: "New contact", edit: "Edit", view: "Open", back: "All opportunities", empty: "No opportunities.", listLabel: "Opportunity list", save: "Save", create: "Create", delete: "Delete", saved: "Saved.", created: "Created.", deleted: "Deleted.", facetStatus: "Stage", closedNote: "Closed opportunity: reopen it to edit.", companies: "Companies", contacts: "Contacts", noCompanies: "No companies.", noContacts: "No contacts.", none: "—", bulk: { qualify: "Qualify", lose: "Mark lost" } },
    fields: { title: "Title", status: "Stage", company: "Company", contact: "Contact", owner: "Owner", amount: "Amount", currency: "Currency", probability: "Probability (%)", expectedCloseDate: "Expected close", lostReason: "Lost reason", quote: "Linked quote", notes: "Notes", name: "Name", firstName: "First name", lastName: "Last name", email: "E-mail", phone: "Phone", website: "Website", country: "Country (ISO)", vatNumber: "VAT number", address: "Address", jobTitle: "Job title", closedAt: "Closed on" },
    summary: { open: "Open", forecast: "Weighted forecast", won: "Won", winRate: "Win rate", count: "Opportunities" },
    actions: { moveTo: "Move to", win: "Won", lose: "Lost", reopen: "Reopen", linkQuote: "Link a quote", unlinkQuote: "Unlink quote" },
    activities: { title: "Activities", add: "Add activity", subject: "Subject", body: "Details", dueAt: "Due", done: "Done", overdue: "Overdue", empty: "No activities.", kind: "Type", kinds: { note: "Note", call: "Call", email: "E-mail", meeting: "Meeting", task: "Task" } },
    stages: { NEW: "New", QUALIFIED: "Qualified", PROPOSAL: "Proposal", NEGOTIATION: "Negotiation", WON: "Won", LOST: "Lost" },
    lostReasons: { price: "Price", competitor: "Competitor", timing: "Timing", no_budget: "No budget", no_decision: "No decision", other: "Other" },
  },
  es: {
    meta: { description: "Empresas, contactos, oportunidades y actividades comerciales." },
    admin: { title: "CRM", pipeline: "Embudo", list: "Lista", newOpportunity: "Nueva oportunidad", newCompany: "Nueva empresa", newContact: "Nuevo contacto", edit: "Editar", view: "Abrir", back: "Todas las oportunidades", empty: "No hay oportunidades.", listLabel: "Lista de oportunidades", save: "Guardar", create: "Crear", delete: "Eliminar", saved: "Guardado.", created: "Creado.", deleted: "Eliminado.", facetStatus: "Etapa", closedNote: "Oportunidad cerrada: reábrala para modificarla.", companies: "Empresas", contacts: "Contactos", noCompanies: "No hay empresas.", noContacts: "No hay contactos.", none: "—", bulk: { qualify: "Calificar", lose: "Marcar perdidas" } },
    fields: { title: "Título", status: "Etapa", company: "Empresa", contact: "Contacto", owner: "Responsable", amount: "Importe", currency: "Moneda", probability: "Probabilidad (%)", expectedCloseDate: "Cierre previsto", lostReason: "Motivo de pérdida", quote: "Presupuesto vinculado", notes: "Notas", name: "Nombre", firstName: "Nombre", lastName: "Apellidos", email: "Correo", phone: "Teléfono", website: "Sitio web", country: "País (ISO)", vatNumber: "NIF-IVA", address: "Dirección", jobTitle: "Cargo", closedAt: "Cerrada el" },
    summary: { open: "Abiertas", forecast: "Previsión ponderada", won: "Ganado", winRate: "Tasa de éxito", count: "Oportunidades" },
    actions: { moveTo: "Pasar a", win: "Ganada", lose: "Perdida", reopen: "Reabrir", linkQuote: "Vincular presupuesto", unlinkQuote: "Desvincular presupuesto" },
    activities: { title: "Actividades", add: "Añadir actividad", subject: "Asunto", body: "Detalle", dueAt: "Vencimiento", done: "Hecha", overdue: "Atrasada", empty: "Sin actividades.", kind: "Tipo", kinds: { note: "Nota", call: "Llamada", email: "Correo", meeting: "Reunión", task: "Tarea" } },
    stages: { NEW: "Nueva", QUALIFIED: "Calificada", PROPOSAL: "Propuesta", NEGOTIATION: "Negociación", WON: "Ganada", LOST: "Perdida" },
    lostReasons: { price: "Precio", competitor: "Competidor", timing: "Plazos", no_budget: "Sin presupuesto", no_decision: "Sin decisión", other: "Otro" },
  },
  ar: {
    meta: { description: "الشركات وجهات الاتصال والفرص والأنشطة التجارية." },
    admin: { title: "إدارة العملاء", pipeline: "مسار المبيعات", list: "القائمة", newOpportunity: "فرصة جديدة", newCompany: "شركة جديدة", newContact: "جهة اتصال جديدة", edit: "تعديل", view: "فتح", back: "كل الفرص", empty: "لا توجد فرص.", listLabel: "قائمة الفرص", save: "حفظ", create: "إنشاء", delete: "حذف", saved: "تم الحفظ.", created: "تم الإنشاء.", deleted: "تم الحذف.", facetStatus: "المرحلة", closedNote: "فرصة مغلقة: أعد فتحها لتعديلها.", companies: "الشركات", contacts: "جهات الاتصال", noCompanies: "لا توجد شركات.", noContacts: "لا توجد جهات اتصال.", none: "—", bulk: { qualify: "تأهيل", lose: "وضع علامة خاسرة" } },
    fields: { title: "العنوان", status: "المرحلة", company: "الشركة", contact: "جهة الاتصال", owner: "المسؤول", amount: "المبلغ", currency: "العملة", probability: "الاحتمال (%)", expectedCloseDate: "الإغلاق المتوقع", lostReason: "سبب الخسارة", quote: "عرض السعر المرتبط", notes: "ملاحظات", name: "الاسم", firstName: "الاسم الأول", lastName: "اسم العائلة", email: "البريد الإلكتروني", phone: "الهاتف", website: "الموقع الإلكتروني", country: "البلد (ISO)", vatNumber: "الرقم الضريبي", address: "العنوان", jobTitle: "المسمى الوظيفي", closedAt: "أُغلقت في" },
    summary: { open: "مفتوحة", forecast: "التوقع المرجّح", won: "المكسوب", winRate: "نسبة النجاح", count: "الفرص" },
    actions: { moveTo: "نقل إلى", win: "مكسوبة", lose: "خاسرة", reopen: "إعادة فتح", linkQuote: "ربط عرض سعر", unlinkQuote: "فك ربط عرض السعر" },
    activities: { title: "الأنشطة", add: "إضافة نشاط", subject: "الموضوع", body: "التفاصيل", dueAt: "الموعد", done: "منجز", overdue: "متأخر", empty: "لا توجد أنشطة.", kind: "النوع", kinds: { note: "ملاحظة", call: "مكالمة", email: "بريد إلكتروني", meeting: "اجتماع", task: "مهمة" } },
    stages: { NEW: "جديدة", QUALIFIED: "مؤهلة", PROPOSAL: "عرض", NEGOTIATION: "تفاوض", WON: "مكسوبة", LOST: "خاسرة" },
    lostReasons: { price: "السعر", competitor: "منافس", timing: "التوقيت", no_budget: "لا ميزانية", no_decision: "لا قرار", other: "أخرى" },
  },
};

export function getCrmTranslations(locale: Locale): CrmTranslations {
  return translations[locale];
}
