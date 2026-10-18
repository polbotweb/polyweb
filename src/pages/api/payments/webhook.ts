import type { APIRoute } from "astro";
import { selectPaymentProvider, UnhandledWebhookError } from "@/modules/payments/domain/providers";
import { applyProviderEvent, isPaymentsEnabled, PaymentAmountMismatchError } from "@/modules/payments/domain/payment-service";

export const prerender = false;

// Webhook fournisseur (repris d'atlaselle) : signature → idempotence → montants.
// 200 après traitement ; 400 signature invalide ; 500 échec (le fournisseur réessaie,
// le traitement est idempotent) ; événement valide non géré = 200 sans effet.
export const POST: APIRoute = async ({ request }) => {
  if (!isPaymentsEnabled()) return new Response("Not Found", { status: 404 });
  let provider;
  try {
    provider = selectPaymentProvider();
  } catch {
    return new Response("Not Found", { status: 404 });
  }
  const rawBody = await request.text();
  const signature = request.headers.get(provider.name === "stripe" ? "stripe-signature" : "x-polyweb-mock-signature");
  let event;
  try {
    event = await provider.verifyWebhook(rawBody, signature);
  } catch (err) {
    if (err instanceof UnhandledWebhookError) return new Response("OK", { status: 200 });
    return new Response("Bad Request", { status: 400 });
  }
  try {
    await applyProviderEvent(event);
  } catch (err) {
    if (err instanceof PaymentAmountMismatchError) {
      console.error("[payments]", err.message);
      return new Response("Unprocessable Entity", { status: 422 });
    }
    console.error("[payments] Webhook processing failed:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
  return new Response("OK", { status: 200 });
};
