import type { Locale } from "@i18n/config";

export type ServiceEngagementTranslations = {
  favorite: string;
  unfavorite: string;
  reactionLabel: string;
  reactionTypes: { LIKE: string; LOVE: string; FIRE: string; CLAP: string };
  reviewTitle: string;
  reviewRating: string;
  reviewContent: string;
  reviewRecommended: string;
  submitReview: string;
  commentTitle: string;
  commentContent: string;
  submitComment: string;
  noReviews: string;
  noComments: string;
  pendingModeration: string;
  helpful: string;
  helpfulMark: string;
  helpfulUnmark: string;
  report: string;
  success: string;
  error: string;
  admin: { moderation: string; categories: string; tags: string; create: string; save: string; delete: string; approve: string; reject: string; spam: string; trash: string; resolve: string; noPending: string; name: string; slug: string; parent: string };
};

const translations: Record<Locale, ServiceEngagementTranslations> = {
  fr: { favorite: "Ajouter aux favoris", unfavorite: "Retirer des favoris", reactionLabel: "Réagir", reactionTypes: { LIKE: "J'aime", LOVE: "J'adore", FIRE: "Excellent", CLAP: "Bravo" }, reviewTitle: "Avis", reviewRating: "Note", reviewContent: "Votre avis", reviewRecommended: "Je recommande ce service", submitReview: "Publier l'avis", commentTitle: "Commentaires", commentContent: "Votre commentaire", submitComment: "Publier le commentaire", noReviews: "Aucun avis pour le moment.", noComments: "Aucun commentaire pour le moment.", pendingModeration: "Votre contribution est en attente de modération.", helpful: "Utile", helpfulMark: "Marquer comme utile", helpfulUnmark: "Retirer le vote utile", report: "Signaler", success: "Enregistré.", error: "Une erreur est survenue.", admin: { moderation: "Modération", categories: "Catégories", tags: "Tags", create: "Créer", save: "Enregistrer", delete: "Supprimer", approve: "Approuver", reject: "Rejeter", spam: "Spam", trash: "Corbeille", resolve: "Résoudre", noPending: "Aucun élément en attente.", name: "Nom", slug: "Slug", parent: "Parent" } },
  en: { favorite: "Add to favorites", unfavorite: "Remove from favorites", reactionLabel: "React", reactionTypes: { LIKE: "Like", LOVE: "Love", FIRE: "Excellent", CLAP: "Clap" }, reviewTitle: "Reviews", reviewRating: "Rating", reviewContent: "Your review", reviewRecommended: "I recommend this service", submitReview: "Submit review", commentTitle: "Comments", commentContent: "Your comment", submitComment: "Submit comment", noReviews: "No reviews yet.", noComments: "No comments yet.", pendingModeration: "Your contribution is awaiting moderation.", helpful: "Helpful", helpfulMark: "Mark helpful", helpfulUnmark: "Remove helpful vote", report: "Report", success: "Saved.", error: "Something went wrong.", admin: { moderation: "Moderation", categories: "Categories", tags: "Tags", create: "Create", save: "Save", delete: "Delete", approve: "Approve", reject: "Reject", spam: "Spam", trash: "Trash", resolve: "Resolve", noPending: "Nothing pending.", name: "Name", slug: "Slug", parent: "Parent" } },
  es: { favorite: "Añadir a favoritos", unfavorite: "Quitar de favoritos", reactionLabel: "Reaccionar", reactionTypes: { LIKE: "Me gusta", LOVE: "Me encanta", FIRE: "Excelente", CLAP: "Aplausos" }, reviewTitle: "Reseñas", reviewRating: "Puntuación", reviewContent: "Tu reseña", reviewRecommended: "Recomiendo este servicio", submitReview: "Publicar reseña", commentTitle: "Comentarios", commentContent: "Tu comentario", submitComment: "Publicar comentario", noReviews: "Aún no hay reseñas.", noComments: "Aún no hay comentarios.", pendingModeration: "Tu contribución está pendiente de moderación.", helpful: "Útil", helpfulMark: "Marcar como útil", helpfulUnmark: "Quitar voto útil", report: "Reportar", success: "Guardado.", error: "Ocurrió un error.", admin: { moderation: "Moderación", categories: "Categorías", tags: "Etiquetas", create: "Crear", save: "Guardar", delete: "Eliminar", approve: "Aprobar", reject: "Rechazar", spam: "Spam", trash: "Papelera", resolve: "Resolver", noPending: "No hay elementos pendientes.", name: "Nombre", slug: "Slug", parent: "Padre" } },
  ar: { favorite: "إضافة إلى المفضلة", unfavorite: "إزالة من المفضلة", reactionLabel: "تفاعل", reactionTypes: { LIKE: "إعجاب", LOVE: "أحببت", FIRE: "ممتاز", CLAP: "تصفيق" }, reviewTitle: "التقييمات", reviewRating: "التقييم", reviewContent: "مراجعتك", reviewRecommended: "أوصي بهذه الخدمة", submitReview: "نشر التقييم", commentTitle: "التعليقات", commentContent: "تعليقك", submitComment: "نشر التعليق", noReviews: "لا توجد تقييمات بعد.", noComments: "لا توجد تعليقات بعد.", pendingModeration: "مساهمتك بانتظار المراجعة.", helpful: "مفيد", helpfulMark: "وضع علامة مفيد", helpfulUnmark: "إزالة التصويت", report: "إبلاغ", success: "تم الحفظ.", error: "حدث خطأ.", admin: { moderation: "الإشراف", categories: "الفئات", tags: "الوسوم", create: "إنشاء", save: "حفظ", delete: "حذف", approve: "موافقة", reject: "رفض", spam: "مزعج", trash: "سلة المهملات", resolve: "حل", noPending: "لا توجد عناصر معلقة.", name: "الاسم", slug: "المعرف", parent: "الأب" } },
};

export function getServiceEngagementTranslations(locale: Locale): ServiceEngagementTranslations { return translations[locale] ?? translations.fr; }
