/** Libellés publics du module courses (4 locales). */
import type { Locale } from "@i18n/config";
import type { CourseLevel } from "../schema";

export type CoursesTranslations = {
  meta: { title: string; description: string };
  labels: { courses: string; course: string; noResults: string; readMore: string; level: string; duration: string; hours: string; minutes: string; lessons: string; price: string; free: string; prerequisites: string; back: string };
  levels: Record<CourseLevel, string>;
};

const translations: Record<Locale, CoursesTranslations> = {
  fr: { meta: { title: "Cours", description: "Découvrez nos cours." }, labels: { courses: "Cours", course: "Cours", noResults: "Aucun cours disponible.", readMore: "Voir le cours", level: "Niveau", duration: "Durée", hours: "h", minutes: "min", lessons: "Plan du cours", price: "Prix", free: "Gratuit", prerequisites: "Prérequis", back: "Tous les cours" }, levels: { BEGINNER: "Débutant", INTERMEDIATE: "Intermédiaire", ADVANCED: "Avancé" } },
  en: { meta: { title: "Courses", description: "Discover our courses." }, labels: { courses: "Courses", course: "Course", noResults: "No courses available.", readMore: "View course", level: "Level", duration: "Duration", hours: "h", minutes: "min", lessons: "Syllabus", price: "Price", free: "Free", prerequisites: "Prerequisites", back: "All courses" }, levels: { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced" } },
  es: { meta: { title: "Cursos", description: "Descubre nuestros cursos." }, labels: { courses: "Cursos", course: "Curso", noResults: "No hay cursos disponibles.", readMore: "Ver curso", level: "Nivel", duration: "Duración", hours: "h", minutes: "min", lessons: "Temario", price: "Precio", free: "Gratis", prerequisites: "Requisitos previos", back: "Todos los cursos" }, levels: { BEGINNER: "Principiante", INTERMEDIATE: "Intermedio", ADVANCED: "Avanzado" } },
  ar: { meta: { title: "الدورات", description: "اكتشف دوراتنا." }, labels: { courses: "الدورات", course: "دورة", noResults: "لا توجد دورات متاحة.", readMore: "عرض الدورة", level: "المستوى", duration: "المدة", hours: "س", minutes: "د", lessons: "خطة الدورة", price: "السعر", free: "مجاني", prerequisites: "المتطلبات المسبقة", back: "كل الدورات" }, levels: { BEGINNER: "مبتدئ", INTERMEDIATE: "متوسط", ADVANCED: "متقدم" } },
};

export function getCoursesTranslations(locale: Locale): CoursesTranslations {
  return translations[locale];
}
