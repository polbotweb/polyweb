import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { blogInternalLinkResolver } from "@/lib/blog/blog-internal-link";
import { getInternalLinkResolver, registerInternalLinkResolver } from "@/lib/content/internal-link-resolver";

registerInternalLinkResolver(blogInternalLinkResolver);

function resolveResolver(resolverName: string | undefined, referer: string | null) {
  const explicit = resolverName?.trim();
  if (explicit) return getInternalLinkResolver(explicit) ?? null;
  if (referer?.includes("/services")) return getInternalLinkResolver("services") ?? null;
  return getInternalLinkResolver("blog") ?? blogInternalLinkResolver;
}

export const resolveBlogInternalLink = defineAction({
  input: z.object({
    target: z.string().trim().optional().default(""),
    mode: z.enum(["resolve", "search"]).default("resolve"),
    query: z.string().trim().optional(),
    resolverName: z.string().trim().optional(),
    organizationId: z.string().trim().min(1).optional().nullable(),
    locale: z.string().trim().min(2).max(5),
  }),
  handler: async (input, context) => {
    const resolver = resolveResolver(input.resolverName, context.request.headers.get("referer"));
    if (!resolver) return { results: [], resolution: { href: "#", title: null, exists: false } };
    const ctx = { locale: input.locale, organizationId: input.organizationId ?? null };
    if (input.mode === "search") {
      const results = await resolver.search(input.query ?? "", { ...ctx, limit: 10 });
      return { results };
    }
    if (!input.target) return { resolution: { href: "#", title: null, exists: false } };
    const resolution = await resolver.resolve(input.target, ctx);
    return { resolution };
  },
});
