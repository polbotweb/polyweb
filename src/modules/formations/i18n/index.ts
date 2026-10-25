/** Libellés publics du module formations (4 locales). */
import type { Locale } from "@i18n/config";
import type { FormationLevel } from "../schema";

export type FormationsTranslations = {
  meta: { title: string; description: string };
  labels: { formations: string; formation: string; noResults: string; readMore: string; level: string; duration: string; hours: string; price: string; free: string; certificate: string; objectives: string; prerequisites: string; back: string };
  levels: Record<FormationLevel, string>;
};

const translations: Record<Locale, FormationsTranslations> = {
  fr: { meta: { title: "Formations", description: "Découvrez nos parcours de formation." }, labels: { formations: "Formations", formation: "Formation", noResults: "Aucune formation disponible.", readMore: "Voir la formation", level: "Niveau", duration: "Durée", hours: "h", price: "Prix", free: "Gratuit", certificate: "Certifiante", objectives: "Objectifs", prerequisites: "Prérequis", back: "Toutes les formations" }, levels: { BEGINNER: "Débutant", INTERMEDIATE: "Intermédiaire", ADVANCED: "Avancé" } },
  en: { meta: { title: "Training programs", description: "Discover our training programs." }, labels: { formations: "Training programs", formation: "Training program", noResults: "No training programs available.", readMore: "View program", level: "Level", duration: "Duration", hours: "h", price: "Price", free: "Free", certificate: "Certificate included", objectives: "Objectives", prerequisites: "Prerequisites", back: "All programs" }, levels: { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced" } },
  es: { meta: { title: "Formaciones", description: "Descubre nuestros programas de formación." }, labels: { formations: "Formaciones", formation: "Formación", noResults: "No hay formaciones disponibles.", readMore: "Ver formación", level: "Nivel", duration: "Duración", hours: "h", price: "Precio", free: "Gratis", certificate: "Con certificado", objectives: "Objetivos", prerequisites: "Requisitos previos", back: "Todas las formaciones" }, levels: { BEGINNER: "Principiante", INTERMEDIATE: "Intermedio", ADVANCED: "Avanzado" } },
  ar: { meta: { title: "التكوينات", description: "اكتشف برامجنا التكوينية." }, labels: { formations: "التكوينات", formation: "تكوين", noResults: "لا توجد تكوينات متاحة.", readMore: "عرض التكوين", level: "المستوى", duration: "المدة", hours: "س", price: "السعر", free: "مجاني", certificate: "بشهادة", objectives: "الأهداف", prerequisites: "المتطلبات المسبقة", back: "كل التكوينات" }, levels: { BEGINNER: "مبتدئ", INTERMEDIATE: "متوسط", ADVANCED: "متقدم" } },
};

export function getFormationsTranslations(locale: Locale): FormationsTranslations {
  return translations[locale];
}
