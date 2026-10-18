import type { Locale } from "@i18n/config";

export interface ServiceNotificationTranslations {
  publishedTitle: string;
  publishedMessage: string;
  reviewTitle: string;
  reviewMessage: string;
  reviewApprovedTitle: string;
  reviewApprovedMessage: string;
  reviewRejectedTitle: string;
  reviewRejectedMessage: string;
  commentTitle: string;
  commentReplyTitle: string;
  contributionPending: string;
}

const translations: Record<Locale, ServiceNotificationTranslations> = {
  fr: {
    publishedTitle: "Service publié", publishedMessage: "Votre service est désormais publié.",
    reviewTitle: "Nouvel avis", reviewMessage: "Un nouvel avis a été soumis pour votre service.",
    reviewApprovedTitle: "Avis approuvé", reviewApprovedMessage: "Votre avis a été approuvé et est maintenant visible.",
    reviewRejectedTitle: "Avis rejeté", reviewRejectedMessage: "Votre avis n'a pas été approuvé.",
    commentTitle: "Nouveau commentaire", commentReplyTitle: "Nouvelle réponse", contributionPending: "Votre contribution est en attente de modération.",
  },
  en: {
    publishedTitle: "Service published", publishedMessage: "Your service is now published.",
    reviewTitle: "New review", reviewMessage: "A new review was submitted for your service.",
    reviewApprovedTitle: "Review approved", reviewApprovedMessage: "Your review has been approved and is now visible.",
    reviewRejectedTitle: "Review rejected", reviewRejectedMessage: "Your review was not approved.",
    commentTitle: "New comment", commentReplyTitle: "New reply", contributionPending: "Your contribution is awaiting moderation.",
  },
  es: {
    publishedTitle: "Servicio publicado", publishedMessage: "Tu servicio ya está publicado.",
    reviewTitle: "Nueva reseña", reviewMessage: "Se ha enviado una nueva reseña para tu servicio.",
    reviewApprovedTitle: "Reseña aprobada", reviewApprovedMessage: "Tu reseña ha sido aprobada y ahora es visible.",
    reviewRejectedTitle: "Reseña rechazada", reviewRejectedMessage: "Tu reseña no ha sido aprobada.",
    commentTitle: "Nuevo comentario", commentReplyTitle: "Nueva respuesta", contributionPending: "Tu contribución está pendiente de moderación.",
  },
  ar: {
    publishedTitle: "تم نشر الخدمة", publishedMessage: "أصبحت خدمتك منشورة الآن.",
    reviewTitle: "تقييم جديد", reviewMessage: "تم إرسال تقييم جديد لخدمتك.",
    reviewApprovedTitle: "تمت الموافقة على التقييم", reviewApprovedMessage: "تمت الموافقة على تقييمك وأصبح مرئياً الآن.",
    reviewRejectedTitle: "تم رفض التقييم", reviewRejectedMessage: "لم تتم الموافقة على تقييمك.",
    commentTitle: "تعليق جديد", commentReplyTitle: "رد جديد", contributionPending: "مساهمتك بانتظار المراجعة.",
  },
};

export function getServiceNotificationTranslations(locale: Locale): ServiceNotificationTranslations {
  return translations[locale] ?? translations.fr;
}
