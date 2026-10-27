/** Mise en forme des créneaux (pure). */
import type { Locale } from "@i18n/config";
import { formatZoned } from "@/core/scheduling";

/** Créneau lisible, dans le fuseau de la ressource : « lundi 11 janvier 2027 à 09:00 – 10:00 ». */
export const formatSlot = (start: Date, end: Date, zone: string, locale: Locale) =>
  `${formatZoned(start, zone, locale, { dateStyle: "full", timeStyle: "short" })} – ${formatZoned(end, zone, locale, { timeStyle: "short" })}`;
