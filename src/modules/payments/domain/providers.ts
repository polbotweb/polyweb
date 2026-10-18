import { createHmac, timingSafeEqual } from "node:crypto";

// Fournisseurs de paiement — repris d'atlaselle (Stripe via fetch, sans SDK, même
// pattern que le provider SMTP Brevo). Mock déterministe pour dev/tests/E2E.
// `reservationId` est devenu `reference` (module générique).

// ─── Interface provider ─────────────────────────────────────────────────────
export interface CreateCheckoutSessionInput {
  amount: number;
  currency: string;
  idempotencyKey: string;
  reference: string;
  description?: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface ProviderCheckoutSession {
  providerSessionId: string;
  checkoutUrl: string;
}

export type WebhookOutcome = "checkout.completed" | "payment.failed";

export interface ProviderWebhookEvent {
  outcome: WebhookOutcome;
  providerPaymentId: string;
  amount: number;
  currency: string;
  idempotencyKey?: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<ProviderCheckoutSession>;
  verifyWebhook(rawBody: string, signature: string | null): Promise<ProviderWebhookEvent>;
  createRefund(input: { providerPaymentId: string; amount?: number; idempotencyKey: string }): Promise<{ providerRefundId: string }>;
}

// Événement valide mais non géré : à ignorer en 200 (pas de retry inutile).
export class UnhandledWebhookError extends Error {
  constructor(type: string) {
    super(`Unhandled Stripe event (ignored): ${type || "unknown"}`);
  }
}

export function selectPaymentProvider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER ?? "mock").toLowerCase();
  if (name === "stripe") return stripeProvider;
  if (process.env.NODE_ENV === "production" && process.env.PAYMENTS_ALLOW_MOCK !== "true") {
    throw new Error("PAYMENT_PROVIDER=mock est interdit en production (PAYMENTS_ALLOW_MOCK=true pour forcer).");
  }
  return mockProvider;
}

// ─── Mock (déterministe, dev/tests — jamais en prod) ─────────────────────────
function mockSessionId(idempotencyKey: string): string {
  let h = 0;
  for (const c of idempotencyKey) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return `mock_cs_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

export const mockProvider: PaymentProvider = {
  name: "mock",
  async createCheckoutSession(input) {
    const providerSessionId = mockSessionId(input.idempotencyKey);
    return { providerSessionId, checkoutUrl: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}mock_session=${providerSessionId}` };
  },
  async verifyWebhook(rawBody, signature) {
    // Signature HMAC même en mock : un endpoint de webhook ne doit jamais
    // accepter un corps non signé, y compris en préproduction.
    const expected = signMockWebhook(rawBody);
    const a = Buffer.from(signature ?? "", "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Signature mock invalide.");
    const event = JSON.parse(rawBody) as {
      providerSessionId?: string;
      providerPaymentId?: string;
      amount?: number;
      currency?: string;
      idempotencyKey?: string;
      failed?: boolean;
    };
    if (!event.providerPaymentId || typeof event.amount !== "number" || !event.currency) {
      throw new Error("Invalid mock webhook payload");
    }
    return {
      outcome: event.failed ? "payment.failed" : "checkout.completed",
      providerPaymentId: event.providerPaymentId,
      amount: event.amount,
      currency: event.currency,
      idempotencyKey: event.idempotencyKey,
      raw: event,
    };
  },
  async createRefund(input) {
    return { providerRefundId: `mock_re_${input.providerPaymentId.replace(/^mock_pi_/, "")}` };
  },
};

/** Signature HMAC-SHA256 (hex) attendue par le provider mock (en-tête x-polyweb-mock-signature). */
export function signMockWebhook(rawBody: string): string {
  const secret = process.env.PAYMENTS_MOCK_SECRET ?? "polyweb-mock-secret";
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function mockPaymentIdForSession(providerSessionId: string): string {
  return `mock_pi_${providerSessionId.replace(/^mock_cs_/, "")}`;
}

// ─── Stripe (REST fetch, sans SDK) ───────────────────────────────────────────
function stripeEnv(): { secretKey: string; webhookSecret: string } {
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!secretKey || !webhookSecret) {
    throw new Error("Stripe non configuré (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET manquants).");
  }
  return { secretKey, webhookSecret };
}

async function stripeApi(path: string, secretKey: string, params: Record<string, string>): Promise<unknown> {
  const { __idempotency, ...form } = params;
  const body = new URLSearchParams(form);
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Clé interne : header uniquement, jamais dans le body (Stripe rejette les params inconnus).
      "Idempotency-Key": __idempotency ?? crypto.randomUUID(),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Stripe API ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<unknown>;
}

export function verifyStripeSignature(rawBody: string, signature: string | null, webhookSecret: string): unknown {
  if (!signature) throw new Error("Signature Stripe manquante.");
  const parts = Object.fromEntries(signature.split(",").map((kv) => kv.split("=", 2) as [string, string]));
  const t = Number(parts.t ?? 0);
  const v1 = parts.v1 ?? "";
  if (!t || !v1) throw new Error("Signature Stripe invalide.");
  if (Math.abs(Date.now() / 1000 - t) > 300) throw new Error("Signature Stripe expirée.");
  const expected = createHmac("sha256", webhookSecret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(v1, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Signature Stripe invalide.");
  return JSON.parse(rawBody) as unknown;
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  async createCheckoutSession(input) {
    const { secretKey } = stripeEnv();
    const data = (await stripeApi("/v1/checkout/sessions", secretKey, {
      mode: "payment",
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(input.amount),
      "line_items[0][price_data][product_data][name]": input.description ?? `Paiement ${input.reference}`,
      "line_items[0][quantity]": "1",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.reference,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      "metadata[idempotency_key]": input.idempotencyKey,
      "metadata[reference]": input.reference,
      __idempotency: input.idempotencyKey,
    })) as { id?: string; url?: string };
    if (!data.id || !data.url) throw new Error("Réponse Stripe inattendue (session).");
    return { providerSessionId: data.id, checkoutUrl: data.url };
  },
  async verifyWebhook(rawBody, signature) {
    const { webhookSecret } = stripeEnv();
    const event = verifyStripeSignature(rawBody, signature, webhookSecret) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const obj = (event.data?.object ?? {}) as Record<string, unknown>;
    const metadata = (obj.metadata ?? {}) as Record<string, unknown>;
    if (event.type === "checkout.session.completed") {
      const amount = obj.amount_total as number | undefined;
      const currency = obj.currency as string | undefined;
      const paymentIntent = obj.payment_intent as string | undefined;
      if (typeof amount !== "number" || typeof currency !== "string") throw new Error("Événement Stripe incomplet.");
      return {
        outcome: "checkout.completed",
        providerPaymentId: paymentIntent ?? (obj.id as string),
        amount,
        currency: currency.toUpperCase(),
        idempotencyKey: typeof metadata.idempotency_key === "string" ? metadata.idempotency_key : undefined,
        raw: event,
      };
    }
    if (event.type === "checkout.session.expired" || event.type === "payment_intent.payment_failed") {
      return {
        outcome: "payment.failed",
        providerPaymentId: (obj.payment_intent as string) ?? (obj.id as string) ?? "unknown",
        amount: (obj.amount_total as number) ?? 0,
        currency: String(obj.currency ?? "").toUpperCase(),
        idempotencyKey: typeof metadata.idempotency_key === "string" ? metadata.idempotency_key : undefined,
        raw: event,
      };
    }
    throw new UnhandledWebhookError(event.type ?? "unknown");
  },
  async createRefund(input) {
    const { secretKey } = stripeEnv();
    const params: Record<string, string> = {
      payment_intent: input.providerPaymentId,
      __idempotency: input.idempotencyKey,
    };
    if (typeof input.amount === "number") params.amount = String(input.amount);
    const data = (await stripeApi("/v1/refunds", secretKey, params)) as { id?: string };
    if (!data.id) throw new Error("Réponse Stripe inattendue (refund).");
    return { providerRefundId: data.id };
  },
};
