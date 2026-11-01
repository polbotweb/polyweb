/** Page « Mon espace client » : session requise, données strictement limitées au compte connecté. */
import type { AstroGlobal } from "astro";
import { requireAuth } from "@/lib/auth-guards";
import { isPaymentsEnabled } from "@/core/payments";
import { runApp } from "@/lib/effect/http";
import { isPayableInvoice } from "@/modules/sales/payments";
import { portalOverview } from "../services/portal.service";

export async function portalPage(Astro: AstroGlobal) {
  const guard = await requireAuth(Astro);
  if ("redirect" in guard) return { redirect: guard.redirect };
  Astro.response.headers.set("cache-control", "private, no-store");
  Astro.response.headers.set("x-robots-tag", "noindex, nofollow");
  const overview = await runApp(portalOverview(guard.user.id));
  const payments = isPaymentsEnabled();
  const invoices = overview.invoices.map((invoice) => ({ ...invoice, payable: payments && isPayableInvoice(invoice) }));
  return { locale: guard.locale, user: guard.user, authT: guard.authT, overview: { ...overview, invoices } };
}
