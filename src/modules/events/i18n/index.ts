/** Libellés publics du module events (4 locales). */
import type { Locale } from "@i18n/config";

export type EventsTranslations = {
  meta: { title: string; description: string };
  labels: { events: string; event: string; noResults: string; readMore: string; startsAt: string; endsAt: string; venue: string; capacity: string; price: string; free: string; back: string };
};

const translations: Record<Locale, EventsTranslations> = {
  fr: { meta: { title: "Événements", description: "Découvrez nos prochains événements." }, labels: { events: "Événements", event: "Événement", noResults: "Aucun événement à venir.", readMore: "Voir l'événement", startsAt: "Début", endsAt: "Fin", venue: "Lieu", capacity: "Capacité", price: "Prix", free: "Gratuit", back: "Tous les événements" } },
  en: { meta: { title: "Events", description: "Discover our upcoming events." }, labels: { events: "Events", event: "Event", noResults: "No upcoming events.", readMore: "View event", startsAt: "Starts", endsAt: "Ends", venue: "Venue", capacity: "Capacity", price: "Price", free: "Free", back: "All events" } },
  es: { meta: { title: "Eventos", description: "Descubre nuestros próximos eventos." }, labels: { events: "Eventos", event: "Evento", noResults: "No hay eventos próximos.", readMore: "Ver evento", startsAt: "Inicio", endsAt: "Fin", venue: "Lugar", capacity: "Aforo", price: "Precio", free: "Gratis", back: "Todos los eventos" } },
  ar: { meta: { title: "الفعاليات", description: "اكتشف فعالياتنا القادمة." }, labels: { events: "الفعاليات", event: "فعالية", noResults: "لا توجد فعاليات قادمة.", readMore: "عرض الفعالية", startsAt: "البداية", endsAt: "النهاية", venue: "المكان", capacity: "السعة", price: "السعر", free: "مجاني", back: "كل الفعاليات" } },
};

export function getEventsTranslations(locale: Locale): EventsTranslations {
  return translations[locale];
}
