import { calculateServiceSeoScore } from "@/modules/services/validation";

export { calculateServiceSeoScore };

export function buildServiceJsonLd(input: { name: string; description?: string | null; slug: string; priceMinor?: number | null; currency?: string | null; ratingAverage100?: number; ratingCount?: number }) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description ?? undefined,
    url: input.slug,
  };
  if (input.priceMinor != null && input.currency) data.offers = { "@type": "Offer", price: input.priceMinor / 100, priceCurrency: input.currency };
  if (input.ratingCount) data.aggregateRating = { "@type": "AggregateRating", ratingValue: (input.ratingAverage100 ?? 0) / 100, reviewCount: input.ratingCount };
  return data;
}
