/** GET /<lang>/account/orders/<id> — vers le suivi signé de la commande (statut, retour ; 404 si d'autrui). */
import type { APIRoute } from "astro";
import { portalRedirect } from "@/modules/portal/public/routes";

export const prerender = false;
export const GET: APIRoute = (context) => portalRedirect(context, "order");
