/** POST /<lang>/account/subscriptions/<id>/cancel — abonnement du client connecté uniquement (404 sinon). */
import type { APIRoute } from "astro";
import { portalSubscriptionAction } from "@/modules/subscriptions/public/routes";

export const prerender = false;
export const POST: APIRoute = (context) => portalSubscriptionAction(context, "cancel");
