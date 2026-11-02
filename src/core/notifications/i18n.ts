/** Libellés des notifications (cloche, page, préférences, désinscription) — 4 locales. */
import type { Locale } from "@i18n/config";
import type { NotificationChannel } from "./registry";

export type NotificationsTranslations = {
  title: string; intro: string; empty: string; unread: string; read: string; markAllRead: string; markRead: string;
  unreadCount: string; filterAll: string; filterUnread: string; filterLabel: string; previous: string; next: string; pagination: string;
  receivedAt: string; preferences: string; preferencesIntro: string; category: string; save: string; saved: string; noCategories: string;
  channels: Record<NotificationChannel, string>;
  categories: Record<string, string>;
  unsubscribe: {
    title: string; confirm: string; button: string; done: string; invalid: string; manage: string;
  };
};

const fr: NotificationsTranslations = {
  title: "Notifications", intro: "Les dernières activités qui vous concernent.", empty: "Aucune notification.", unread: "Non lue", read: "Lue",
  markAllRead: "Tout marquer comme lu", markRead: "Marquer comme lue", unreadCount: "{count} non lue(s)",
  filterAll: "Toutes", filterUnread: "Non lues", filterLabel: "Filtrer les notifications", previous: "Page précédente", next: "Page suivante", pagination: "Pagination des notifications",
  receivedAt: "Reçue le", preferences: "Préférences de notification", preferencesIntro: "Choisissez, pour chaque catégorie, comment être prévenu.",
  category: "Catégorie", save: "Enregistrer les préférences", saved: "Préférences enregistrées.", noCategories: "Aucune catégorie de notification n'est disponible.",
  channels: { in_app: "Dans l'application", email: "Par e-mail" },
  categories: { comments: "Commentaires", reviews: "Avis", publishing: "Publications", mentions: "Mentions", billing: "Facturation", system: "Système" },
  unsubscribe: {
    title: "Se désinscrire", confirm: "Ne plus recevoir les e-mails de la catégorie « {category} » ?", button: "Confirmer la désinscription",
    done: "C'est fait : vous ne recevrez plus d'e-mails de la catégorie « {category} ».", invalid: "Ce lien de désinscription est invalide ou a expiré.",
    manage: "Gérer toutes mes préférences",
  },
};
const en: NotificationsTranslations = {
  title: "Notifications", intro: "Latest activity that concerns you.", empty: "No notifications.", unread: "Unread", read: "Read",
  markAllRead: "Mark all as read", markRead: "Mark as read", unreadCount: "{count} unread",
  filterAll: "All", filterUnread: "Unread", filterLabel: "Filter notifications", previous: "Previous page", next: "Next page", pagination: "Notifications pagination",
  receivedAt: "Received on", preferences: "Notification preferences", preferencesIntro: "Choose, for each category, how you want to be notified.",
  category: "Category", save: "Save preferences", saved: "Preferences saved.", noCategories: "No notification category is available.",
  channels: { in_app: "In the app", email: "By email" },
  categories: { comments: "Comments", reviews: "Reviews", publishing: "Publishing", mentions: "Mentions", billing: "Billing", system: "System" },
  unsubscribe: {
    title: "Unsubscribe", confirm: "Stop receiving emails in the “{category}” category?", button: "Confirm unsubscribe",
    done: "Done: you will no longer receive emails in the “{category}” category.", invalid: "This unsubscribe link is invalid or has expired.",
    manage: "Manage all my preferences",
  },
};
const es: NotificationsTranslations = {
  title: "Notificaciones", intro: "La actividad más reciente que le concierne.", empty: "Ninguna notificación.", unread: "No leída", read: "Leída",
  markAllRead: "Marcar todo como leído", markRead: "Marcar como leída", unreadCount: "{count} sin leer",
  filterAll: "Todas", filterUnread: "No leídas", filterLabel: "Filtrar notificaciones", previous: "Página anterior", next: "Página siguiente", pagination: "Paginación de notificaciones",
  receivedAt: "Recibida el", preferences: "Preferencias de notificación", preferencesIntro: "Elija, para cada categoría, cómo quiere ser avisado.",
  category: "Categoría", save: "Guardar preferencias", saved: "Preferencias guardadas.", noCategories: "No hay ninguna categoría de notificación disponible.",
  channels: { in_app: "En la aplicación", email: "Por correo" },
  categories: { comments: "Comentarios", reviews: "Opiniones", publishing: "Publicaciones", mentions: "Menciones", billing: "Facturación", system: "Sistema" },
  unsubscribe: {
    title: "Darse de baja", confirm: "¿Dejar de recibir correos de la categoría «{category}»?", button: "Confirmar la baja",
    done: "Hecho: ya no recibirá correos de la categoría «{category}».", invalid: "Este enlace de baja no es válido o ha caducado.",
    manage: "Gestionar todas mis preferencias",
  },
};
const ar: NotificationsTranslations = {
  title: "الإشعارات", intro: "آخر الأنشطة التي تخصك.", empty: "لا توجد إشعارات.", unread: "غير مقروء", read: "مقروء",
  markAllRead: "تعليم الكل كمقروء", markRead: "تعليم كمقروء", unreadCount: "{count} غير مقروء",
  filterAll: "الكل", filterUnread: "غير المقروءة", filterLabel: "تصفية الإشعارات", previous: "الصفحة السابقة", next: "الصفحة التالية", pagination: "ترقيم صفحات الإشعارات",
  receivedAt: "تاريخ الاستلام", preferences: "تفضيلات الإشعارات", preferencesIntro: "اختر لكل فئة طريقة إعلامك.",
  category: "الفئة", save: "حفظ التفضيلات", saved: "تم حفظ التفضيلات.", noCategories: "لا توجد فئة إشعارات متاحة.",
  channels: { in_app: "داخل التطبيق", email: "عبر البريد الإلكتروني" },
  categories: { comments: "التعليقات", reviews: "المراجعات", publishing: "النشر", mentions: "الإشارات", billing: "الفوترة", system: "النظام" },
  unsubscribe: {
    title: "إلغاء الاشتراك", confirm: "هل تريد التوقف عن تلقي رسائل فئة «{category}»؟", button: "تأكيد إلغاء الاشتراك",
    done: "تم: لن تتلقى بعد الآن رسائل فئة «{category}».", invalid: "رابط إلغاء الاشتراك هذا غير صالح أو منتهي الصلاحية.",
    manage: "إدارة جميع تفضيلاتي",
  },
};

const dictionaries: Record<Locale, NotificationsTranslations> = { fr, en, es, ar };

export const getNotificationsTranslations = (locale: Locale): NotificationsTranslations => dictionaries[locale];

export const categoryLabel = (t: NotificationsTranslations, category: string) => t.categories[category] ?? category;

export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
