/** POST /<lang>/subscriptions/checkout — démarre la souscription puis redirige vers le paiement. */
import type { APIRoute } from "astro";
import { subscriptionCheckout } from "@/modules/subscriptions/public/routes";

export const prerender = false;
export const POST: APIRoute = (context) => subscriptionCheckout(context);
