import type { APIRoute } from "astro";
import { LOCALES } from "@i18n/config";

export const prerender = false;

/**
 * GET /robots.txt
 * Dynamic robots.txt that references the sitemap.
 */
export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site?.origin ?? "http://localhost:4321";

  const lines = [
    "User-agent: *",
    "Allow: /",
    "",
    // Disallow admin, API, and internal routes
    "Disallow: /api/",
    "Disallow: /_actions/",
    "Disallow: /_image/",
  ];

  // Disallow admin routes for all locales
  for (const locale of LOCALES) {
    lines.push(`Disallow: /${locale}/admin/`);
  }

  lines.push("");
  lines.push(`Sitemap: ${baseUrl}/sitemap-index.xml`);
  lines.push(`Sitemap: ${baseUrl}/sitemap-cms.xml`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
