import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { isValidLocale } from "@i18n/utils";
import { registerInternalLinkResolver } from "@/lib/content/internal-link-resolver";
import { serviceInternalLinkResolver } from "@/lib/services/services-internal-link";

registerInternalLinkResolver(serviceInternalLinkResolver);

export const resolveServiceInternalLink = defineAction({
  input: z.object({
    target: z.string().trim().min(1).max(200),
    mode: z.enum(["resolve", "search"]).default("resolve"),
    query: z.string().trim().max(120).optional(),
    organizationId: z.string().trim().min(1).optional().nullable(),
    locale: z.string().refine(isValidLocale, "Unsupported locale"),
  }),
  handler: async (input) => {
    const ctx = { locale: input.locale, organizationId: input.organizationId ?? null };
    if (input.mode === "search") return { results: await serviceInternalLinkResolver.search(input.query ?? "", { ...ctx, limit: 10 }) };
    return { resolution: await serviceInternalLinkResolver.resolve(input.target, ctx) };
  },
});
