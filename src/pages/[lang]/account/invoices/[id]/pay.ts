/** GET /<lang>/account/invoices/<id>/pay — vers la page de paiement signée (404 si d'autrui). */
import type { APIRoute } from "astro";
import { portalRedirect } from "@/modules/portal/public/routes";

export const prerender = false;
export const GET: APIRoute = (context) => portalRedirect(context, "invoice-pay");
