/**
 * Forum et catégories créés par défaut pour chaque site (idempotent, voir `ensureSiteForum`).
 * Libellés dans les 4 locales ; l'administration peut ensuite les renommer, réordonner,
 * supprimer ou en ajouter.
 */
import type { ForumCategoryTranslations } from "../schema";

export const DEFAULT_FORUM = {
  slug: "communaute",
  title: "Communauté",
  description: "Échanges, questions et annonces de la communauté.",
} as const;

export const DEFAULT_FORUM_CATEGORIES: readonly { slug: string; translations: ForumCategoryTranslations }[] = [
  { slug: "annonces", translations: { fr: { name: "Annonces", description: "Nouvelles et informations officielles." }, en: { name: "Announcements", description: "News and official information." }, es: { name: "Anuncios", description: "Novedades e información oficial." }, ar: { name: "الإعلانات", description: "الأخبار والمعلومات الرسمية." } } },
  { slug: "general", translations: { fr: { name: "Discussions générales", description: "Tout ce qui ne rentre pas ailleurs." }, en: { name: "General discussion", description: "Everything that does not fit elsewhere." }, es: { name: "Conversaciones generales", description: "Todo lo que no encaja en otro lugar." }, ar: { name: "نقاشات عامة", description: "كل ما لا يناسب الأقسام الأخرى." } } },
  { slug: "entraide", translations: { fr: { name: "Questions et entraide", description: "Posez vos questions, aidez les autres." }, en: { name: "Questions and help", description: "Ask questions, help others." }, es: { name: "Preguntas y ayuda", description: "Haga preguntas, ayude a los demás." }, ar: { name: "أسئلة ومساعدة", description: "اطرح أسئلتك وساعد الآخرين." } } },
  { slug: "suggestions", translations: { fr: { name: "Suggestions", description: "Idées et retours d'expérience." }, en: { name: "Suggestions", description: "Ideas and feedback." }, es: { name: "Sugerencias", description: "Ideas y comentarios." }, ar: { name: "اقتراحات", description: "أفكار وملاحظات." } } },
  { slug: "presentations", translations: { fr: { name: "Présentations", description: "Présentez-vous à la communauté." }, en: { name: "Introductions", description: "Introduce yourself to the community." }, es: { name: "Presentaciones", description: "Preséntese a la comunidad." }, ar: { name: "التعارف", description: "قدّم نفسك للمجتمع." } } },
];

/** Libellé d'une catégorie dans une locale (repli : fr, puis première locale, puis slug). */
export function categoryLabel(translations: ForumCategoryTranslations, locale: string, slug: string): { name: string; description: string } {
  const entry = translations[locale] ?? translations.fr ?? Object.values(translations)[0];
  return { name: entry?.name || slug, description: entry?.description ?? "" };
}
