/** Libellés de la modération générique (pages plateforme et organisation, formulaire de signalement) — 4 locales. */
import type { Locale } from "@i18n/config";

export type ModerationTranslations = {
  title: string; description: string; intro: string; empty: string; unavailable: string;
  tabs: { open: string; resolved: string; dismissed: string }; tabsLabel: string;
  modules: Record<string, string>;
  targets: Record<string, string>;
  reasons: Record<string, string>;
  statuses: Record<string, string>;
  actions: Record<string, string>;
  reports: string; firstReported: string; lastReported: string; currentStatus: string; lastDecision: string; openContent: string;
  noteLabel: string; noteHint: string; reasonLabel: string; submitting: string; done: string; error: string; noChange: string;
  pagination: string; previous: string; next: string; page: string;
  report: { title: string; reasonLabel: string; descriptionLabel: string; descriptionHint: string; submit: string; thanks: string; loginRequired: string; error: string };
  legacyNotice: string; legacyLink: string;
};

const reasons = {
  fr: { spam: "Spam", abusive: "Contenu abusif", off_topic: "Hors sujet", hate_speech: "Discours haineux", other: "Autre" },
  en: { spam: "Spam", abusive: "Abusive content", off_topic: "Off topic", hate_speech: "Hate speech", other: "Other" },
  es: { spam: "Spam", abusive: "Contenido abusivo", off_topic: "Fuera de tema", hate_speech: "Discurso de odio", other: "Otro" },
  ar: { spam: "رسائل مزعجة", abusive: "محتوى مسيء", off_topic: "خارج الموضوع", hate_speech: "خطاب كراهية", other: "أخرى" },
};

const fr: ModerationTranslations = {
  title: "Modération", description: "Signalements et décisions de modération.",
  intro: "Signalements regroupés par contenu. Chaque décision est motivée, historisée et auditée ; aucun contenu n'est supprimé ni modifié.",
  empty: "Aucun signalement dans cette liste.", unavailable: "Contenu introuvable (supprimé) : seuls ses signalements peuvent être clos.",
  tabs: { open: "Ouverts", resolved: "Traités", dismissed: "Rejetés" }, tabsLabel: "Filtrer par état des signalements",
  modules: { blog: "Blog", services: "Services" },
  targets: { post: "Article", comment: "Commentaire", review: "Avis", service: "Service" },
  reasons: reasons.fr,
  statuses: { PENDING: "En attente", APPROVED: "Publié", REJECTED: "Masqué", SPAM: "Spam", TRASH: "Corbeille", PUBLISHED: "Publié", DRAFT: "Brouillon", ARCHIVED: "Archivé", DELETED: "Supprimé" },
  actions: { hide: "Masquer", restore: "Rétablir", spam: "Marquer comme spam", resolve: "Clore (traité)", dismiss: "Rejeter les signalements", approve: "Approuvé", reject: "Rejeté", trash: "Mis à la corbeille", reset: "Remis en attente", edit: "Modifié" },
  reports: "{count} signalement(s)", firstReported: "Premier signalement", lastReported: "Dernier signalement", currentStatus: "État du contenu", lastDecision: "Dernière décision", openContent: "Voir le contenu",
  noteLabel: "Motif de la décision", noteHint: "Obligatoire, visible des modérateurs seulement.", reasonLabel: "Motif codifié",
  submitting: "Enregistrement…", done: "Décision enregistrée.", error: "La décision n'a pas pu être enregistrée.", noChange: "Aucun changement : la décision était déjà appliquée.",
  pagination: "Pagination de la modération", previous: "Page précédente", next: "Page suivante", page: "Page {page} sur {pages}",
  report: { title: "Signaler ce contenu", reasonLabel: "Motif", descriptionLabel: "Précisions (facultatif)", descriptionHint: "1000 caractères maximum.", submit: "Envoyer le signalement", thanks: "Merci, votre signalement a été transmis.", loginRequired: "Connectez-vous pour signaler ce contenu.", error: "Le signalement n'a pas pu être envoyé." },
  legacyNotice: "Les signalements sont désormais traités dans la file de modération commune.", legacyLink: "Ouvrir la modération",
};

const en: ModerationTranslations = {
  title: "Moderation", description: "Reports and moderation decisions.",
  intro: "Reports grouped by content. Every decision is justified, recorded and audited; no content is deleted or edited.",
  empty: "No reports in this list.", unavailable: "Content not found (deleted): only its reports can be closed.",
  tabs: { open: "Open", resolved: "Resolved", dismissed: "Dismissed" }, tabsLabel: "Filter by report state",
  modules: { blog: "Blog", services: "Services" },
  targets: { post: "Post", comment: "Comment", review: "Review", service: "Service" },
  reasons: reasons.en,
  statuses: { PENDING: "Pending", APPROVED: "Published", REJECTED: "Hidden", SPAM: "Spam", TRASH: "Trash", PUBLISHED: "Published", DRAFT: "Draft", ARCHIVED: "Archived", DELETED: "Deleted" },
  actions: { hide: "Hide", restore: "Restore", spam: "Mark as spam", resolve: "Close (resolved)", dismiss: "Dismiss reports", approve: "Approved", reject: "Rejected", trash: "Moved to trash", reset: "Reset to pending", edit: "Edited" },
  reports: "{count} report(s)", firstReported: "First reported", lastReported: "Last reported", currentStatus: "Content state", lastDecision: "Last decision", openContent: "View content",
  noteLabel: "Reason for the decision", noteHint: "Required, visible to moderators only.", reasonLabel: "Reason code",
  submitting: "Saving…", done: "Decision saved.", error: "The decision could not be saved.", noChange: "No change: the decision was already applied.",
  pagination: "Moderation pagination", previous: "Previous page", next: "Next page", page: "Page {page} of {pages}",
  report: { title: "Report this content", reasonLabel: "Reason", descriptionLabel: "Details (optional)", descriptionHint: "1000 characters maximum.", submit: "Send report", thanks: "Thank you, your report has been sent.", loginRequired: "Sign in to report this content.", error: "The report could not be sent." },
  legacyNotice: "Reports are now handled in the shared moderation queue.", legacyLink: "Open moderation",
};

const es: ModerationTranslations = {
  title: "Moderación", description: "Denuncias y decisiones de moderación.",
  intro: "Denuncias agrupadas por contenido. Cada decisión se justifica, se registra y se audita; ningún contenido se elimina ni se modifica.",
  empty: "No hay denuncias en esta lista.", unavailable: "Contenido no encontrado (eliminado): solo se pueden cerrar sus denuncias.",
  tabs: { open: "Abiertas", resolved: "Resueltas", dismissed: "Rechazadas" }, tabsLabel: "Filtrar por estado de las denuncias",
  modules: { blog: "Blog", services: "Servicios" },
  targets: { post: "Artículo", comment: "Comentario", review: "Opinión", service: "Servicio" },
  reasons: reasons.es,
  statuses: { PENDING: "Pendiente", APPROVED: "Publicado", REJECTED: "Oculto", SPAM: "Spam", TRASH: "Papelera", PUBLISHED: "Publicado", DRAFT: "Borrador", ARCHIVED: "Archivado", DELETED: "Eliminado" },
  actions: { hide: "Ocultar", restore: "Restablecer", spam: "Marcar como spam", resolve: "Cerrar (resuelta)", dismiss: "Rechazar las denuncias", approve: "Aprobado", reject: "Rechazado", trash: "Enviado a la papelera", reset: "Vuelto a pendiente", edit: "Modificado" },
  reports: "{count} denuncia(s)", firstReported: "Primera denuncia", lastReported: "Última denuncia", currentStatus: "Estado del contenido", lastDecision: "Última decisión", openContent: "Ver el contenido",
  noteLabel: "Motivo de la decisión", noteHint: "Obligatorio, visible solo para los moderadores.", reasonLabel: "Motivo codificado",
  submitting: "Guardando…", done: "Decisión guardada.", error: "No se pudo guardar la decisión.", noChange: "Sin cambios: la decisión ya estaba aplicada.",
  pagination: "Paginación de la moderación", previous: "Página anterior", next: "Página siguiente", page: "Página {page} de {pages}",
  report: { title: "Denunciar este contenido", reasonLabel: "Motivo", descriptionLabel: "Detalles (opcional)", descriptionHint: "1000 caracteres como máximo.", submit: "Enviar la denuncia", thanks: "Gracias, su denuncia ha sido enviada.", loginRequired: "Inicie sesión para denunciar este contenido.", error: "No se pudo enviar la denuncia." },
  legacyNotice: "Las denuncias se gestionan ahora en la cola de moderación común.", legacyLink: "Abrir la moderación",
};

const ar: ModerationTranslations = {
  title: "الإشراف", description: "البلاغات وقرارات الإشراف.",
  intro: "بلاغات مجمّعة حسب المحتوى. كل قرار مُعلَّل ومُسجَّل ومُدقَّق؛ لا يُحذف أي محتوى ولا يُعدَّل.",
  empty: "لا توجد بلاغات في هذه القائمة.", unavailable: "المحتوى غير موجود (محذوف): يمكن إغلاق بلاغاته فقط.",
  tabs: { open: "مفتوحة", resolved: "معالجة", dismissed: "مرفوضة" }, tabsLabel: "تصفية حسب حالة البلاغات",
  modules: { blog: "المدونة", services: "الخدمات" },
  targets: { post: "مقال", comment: "تعليق", review: "مراجعة", service: "خدمة" },
  reasons: reasons.ar,
  statuses: { PENDING: "قيد الانتظار", APPROVED: "منشور", REJECTED: "مخفي", SPAM: "رسائل مزعجة", TRASH: "سلة المحذوفات", PUBLISHED: "منشور", DRAFT: "مسودة", ARCHIVED: "مؤرشف", DELETED: "محذوف" },
  actions: { hide: "إخفاء", restore: "استعادة", spam: "وضع علامة رسائل مزعجة", resolve: "إغلاق (تمت المعالجة)", dismiss: "رفض البلاغات", approve: "تمت الموافقة", reject: "مرفوض", trash: "نُقل إلى السلة", reset: "أُعيد إلى الانتظار", edit: "عُدّل" },
  reports: "{count} بلاغ", firstReported: "أول بلاغ", lastReported: "آخر بلاغ", currentStatus: "حالة المحتوى", lastDecision: "آخر قرار", openContent: "عرض المحتوى",
  noteLabel: "سبب القرار", noteHint: "إلزامي، يراه المشرفون فقط.", reasonLabel: "رمز السبب",
  submitting: "جارٍ الحفظ…", done: "تم حفظ القرار.", error: "تعذّر حفظ القرار.", noChange: "لا تغيير: القرار مطبّق مسبقًا.",
  pagination: "ترقيم صفحات الإشراف", previous: "الصفحة السابقة", next: "الصفحة التالية", page: "الصفحة {page} من {pages}",
  report: { title: "الإبلاغ عن هذا المحتوى", reasonLabel: "السبب", descriptionLabel: "تفاصيل (اختياري)", descriptionHint: "1000 حرف كحد أقصى.", submit: "إرسال البلاغ", thanks: "شكرًا، تم إرسال بلاغك.", loginRequired: "سجّل الدخول للإبلاغ عن هذا المحتوى.", error: "تعذّر إرسال البلاغ." },
  legacyNotice: "تُعالَج البلاغات الآن في قائمة الإشراف المشتركة.", legacyLink: "فتح الإشراف",
};

const translations: Record<Locale, ModerationTranslations> = { fr, en, es, ar };

export function getModerationTranslations(locale: Locale): ModerationTranslations {
  return translations[locale] ?? fr;
}
