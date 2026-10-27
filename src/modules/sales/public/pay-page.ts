/** Page publique de paiement d'une facture (lien signé `?t=`) : lecture GET, session fournisseur sur POST uniquement. */
import type { AstroGlobal } from "astro";
import { Effect } from "effect";
import { toLocale } from "@i18n/utils";
import { isPaymentsEnabled } from "@/core/payments";
import { AppConfig } from "@/lib/effect/config";
import { runApp, runAppResult } from "@/lib/effect/http";
import { invoiceForPayLink, isPayableInvoice, payLinkPath, startInvoiceCheckout } from "../payments";

export type PayNotice = { readonly kind: "success" | "error"; readonly text: "processing" | "unavailable" } | null;

const linkInvoice = (id: string, token: string) => Effect.flatMap(AppConfig, (config) => invoiceForPayLink(config.signingSecret, id, token));

export async function payInvoicePage(Astro: AstroGlobal) {
  const locale = toLocale(Astro.params.lang);
  if (!isPaymentsEnabled()) return Astro.rewrite("/404");
  // Le lien contient un secret : jamais en cache, jamais indexé.
  Astro.response.headers.set("cache-control", "private, no-store");
  Astro.response.headers.set("x-robots-tag", "noindex, nofollow");
  const id = Astro.params.id ?? "";
  let token = Astro.url.searchParams.get("t") ?? "";
  let notice: PayNotice = null;

  if (Astro.request.method === "POST") {
    const value = (await Astro.request.formData()).get("t");
    token = typeof value === "string" && value ? value : token;
    const started = await runAppResult(Effect.gen(function* () {
      const invoice = yield* linkInvoice(id, token);
      if (!invoice || !isPayableInvoice(invoice)) return null;
      const config = yield* AppConfig;
      const back = `${config.siteUrl}${payLinkPath(locale, invoice.id, token)}`;
      const { url } = yield* startInvoiceCheckout(invoice, { successUrl: `${back}&paid=1`, cancelUrl: back });
      return url;
    }).pipe(Effect.tapError((error) => Effect.logWarning("[sales] paiement en ligne indisponible", { invoiceId: id, error: error._tag }))));
    if (started.ok && started.value) return Astro.redirect(started.value, 303);
    // Échec fournisseur / paiements indisponibles : message, la page reste utilisable (nouvel essai).
    if (!started.ok) {
      Astro.response.status = 503;
      notice = { kind: "error", text: "unavailable" };
    }
  }

  const invoice = await runApp(linkInvoice(id, token));
  if (!invoice) Astro.response.status = 404;
  const payable = !!invoice && isPayableInvoice(invoice);
  if (!notice && payable && Astro.url.searchParams.get("paid") === "1") notice = { kind: "success", text: "processing" };
  return { locale, invoice, token, payable, notice };
}
