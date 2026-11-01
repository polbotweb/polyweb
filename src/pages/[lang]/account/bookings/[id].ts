/** GET /<lang>/account/bookings/<id> — vers la gestion signée de la réservation (annulation ; 404 si d'autrui). */
import type { APIRoute } from "astro";
import { portalRedirect } from "@/modules/portal/public/routes";

export const prerender = false;
export const GET: APIRoute = (context) => portalRedirect(context, "booking");
