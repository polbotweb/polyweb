import type { APIRoute } from "astro";
import { getActiveThemeCss } from "@database/loaders/site.loader";

/**
 * CSS du thème actif, servi comme feuille externe (autorisée par `style-src 'self'`).
 * Un <style> inline n'est pas utilisable avec la CSP en en-tête : son empreinte ne peut être
 * déclarée qu'avant le rendu, alors que le thème est lu dans BaseLayout (composant enfant).
 * BaseLayout ajoute `?v=<empreinte du contenu>` : un changement de thème change l'URL.
 */
export const GET: APIRoute = async ({ url }) => {
  const css = await getActiveThemeCss();
  return new Response(css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": url.searchParams.has("v") ? "public, max-age=31536000, immutable" : "no-cache",
    },
  });
};
