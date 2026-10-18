import { slugify } from "@/core/content/text";
import { buildServiceUrl, buildServiceCategoryUrl } from "./urls";

export { slugify, buildServiceUrl, buildServiceCategoryUrl };

export function formatServicePrice(priceMinor: number | null, currency: string | null, locale: string): string | null {
  if (priceMinor === null || !currency) return null;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(priceMinor / 100);
}

export function formatServiceDuration(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

export function formatServiceRating(ratingAverage100: number): number {
  return Math.round((ratingAverage100 / 100) * 10) / 10;
}
