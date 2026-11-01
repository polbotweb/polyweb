/** GET /<lang>/account/invoices/<id>/pdf — PDF d'une facture du client connecté (404 si d'autrui). */
import type { APIRoute } from "astro";
import { portalInvoicePdf } from "@/modules/portal/public/routes";

export const prerender = false;
export const GET: APIRoute = (context) => portalInvoicePdf(context);
