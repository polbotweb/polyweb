/**
 * Contrôleurs des pages publiques du tunnel (panier, commande, suivi). Chaque fonction renvoie
 * soit une `Response` (redirection 303 après POST), soit les props de la vue. Formulaires HTML
 * classiques (aucun JS → CSP stricte) ; l'origine des POST est contrôlée par le middleware.
 */
import type { AstroGlobal } from "astro";
import { toLocale } from "@i18n/utils";
import { runApp, runAppResult } from "@/lib/effect/http";
import { extractIp } from "@/lib/audit";
import { formTimestampToken } from "@/modules/forms/domain/forms";
import { CART_COOKIE, CART_TTL_SECONDS } from "../domain/cart-token";
import type { CheckoutField } from "../domain/errors";
import { CHECKOUT_FIELDS } from "../domain/errors";
import type { CheckoutNoticeKey } from "../i18n/checkout";
import { cartService } from "../services/cart.service";
import type { ReturnPublicNoticeKey } from "../i18n/returns";
import { addToCart, checkoutPreview, orderPayable, parseQuantity, payOrder, publicOrder, publicOrderReturns, requestOrderReturn, resolveOwner, returnQuantitiesOf, shopPaths, submitCheckout } from "./flow";

export type ReturnNotice = { readonly kind: "success" | "error"; readonly text: ReturnPublicNoticeKey; readonly number?: string } | null;
export type Notice = { readonly kind: "success" | "error"; readonly text: CheckoutNoticeKey; readonly sku?: string } | null;

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
const privatePage = (Astro: AstroGlobal) => {
  Astro.response.headers.set("cache-control", "private, no-store");
  Astro.response.headers.set("x-robots-tag", "noindex, nofollow");
};

const setCartCookie = (Astro: AstroGlobal, token: string) =>
  Astro.cookies.set(CART_COOKIE, token, { path: "/", httpOnly: true, sameSite: "lax", secure: Astro.url.protocol === "https:", maxAge: CART_TTL_SECONDS });

const visitorOwner = async (Astro: AstroGlobal) => {
  const resolved = await runApp(resolveOwner({ cookie: Astro.cookies.get(CART_COOKIE)?.value ?? null, userId: Astro.locals.user?.id ?? null }));
  if (resolved.clearCookie) Astro.cookies.delete(CART_COOKIE, { path: "/" });
  return resolved.owner;
};

const cartErrorNotice = (error: { _tag?: string; field?: string; code?: string }): { status: number; text: CheckoutNoticeKey } => {
  if (error._tag === "InvalidCartError") {
    if (error.field === "lines") return { status: 422, text: "cartFull" };
    if (error.field === "currency") return { status: 422, text: "currencyMismatch" };
    return { status: 422, text: "invalidQuantity" };
  }
  if (error.code === "NOT_FOUND" || error.code === "CONFLICT") return { status: 409, text: "unavailable" };
  return { status: 500, text: "generic" };
};

export async function cartPage(Astro: AstroGlobal) {
  const locale = toLocale(Astro.params.lang);
  privatePage(Astro);
  const owner = await visitorOwner(Astro);
  let notice: Notice = null;

  if (Astro.request.method === "POST") {
    const fd = await Astro.request.formData();
    const intent = str(fd, "intent");
    const quantity = intent === "remove" ? 0 : parseQuantity(str(fd, "quantity") || "1");
    const r = intent === "add"
      ? await runAppResult(addToCart(owner, str(fd, "variantId"), quantity))
      : await runAppResult(cartService.setQuantity(owner, str(fd, "lineId"), quantity));
    if (r.ok) {
      if (intent === "add" && typeof r.value === "string") setCartCookie(Astro, r.value);
      return Astro.redirect(`${shopPaths.cart(locale)}?${intent === "add" ? "added" : "updated"}=1`, 303);
    }
    const mapped = cartErrorNotice(r.error as { _tag?: string; field?: string; code?: string });
    Astro.response.status = mapped.status;
    notice = { kind: "error", text: mapped.text };
  }
  const view = await runApp(cartService.view(owner, locale));
  const q = Astro.url.searchParams;
  if (!notice && q.get("added") === "1") notice = { kind: "success", text: "added" };
  if (!notice && q.get("updated") === "1") notice = { kind: "success", text: "updated" };
  if (!notice && q.get("changed") === "1") notice = { kind: "error", text: "cartChanged" };
  return { locale, view, notice };
}

export async function checkoutPage(Astro: AstroGlobal) {
  const locale = toLocale(Astro.params.lang);
  privatePage(Astro);
  const owner = await visitorOwner(Astro);
  let values: Record<string, string> = {};
  let errors: readonly CheckoutField[] = [];
  let notice: Notice = null;

  if (Astro.request.method === "POST") {
    const fd = await Astro.request.formData();
    values = Object.fromEntries(CHECKOUT_FIELDS.map((k) => [k, str(fd, k)]));
    if (str(fd, "intent") !== "quote") {
      const r = await runAppResult(submitCheckout(owner, { ...values, _hp: str(fd, "_hp"), _ts: str(fd, "_ts") }, {
        ip: extractIp(Astro.request.headers, Astro.clientAddress), userAgent: Astro.request.headers.get("user-agent"), locale,
      }));
      if (r.ok) return r.value.kind === "redirect" ? Astro.redirect(r.value.url, 303) : Astro.redirect(shopPaths.cart(locale), 303);
      const e = r.error as { _tag?: string; fields?: readonly CheckoutField[]; retryAfterSeconds?: number; code?: string; sku?: string };
      if (e._tag === "InvalidCheckoutError") {
        errors = e.fields ?? [];
        Astro.response.status = 422;
        notice = { kind: "error", text: "errorSummary" };
      } else if (e._tag === "OutOfStockError") {
        Astro.response.status = 409;
        notice = { kind: "error", text: "outOfStock", sku: e.sku };
      } else if (e._tag === "EmptyCart") {
        return Astro.redirect(shopPaths.cart(locale), 303);
      } else if (e._tag === "RateLimitedError") {
        Astro.response.status = 429;
        Astro.response.headers.set("retry-after", String(e.retryAfterSeconds ?? 60));
        notice = { kind: "error", text: "rateLimited" };
      } else if (e.code === "CONFLICT" || e.code === "NOT_FOUND") {
        return Astro.redirect(`${shopPaths.cart(locale)}?changed=1`, 303);
      } else {
        Astro.response.status = 500;
        notice = { kind: "error", text: e._tag?.startsWith("Payment") || e._tag?.startsWith("Provider") ? "payUnavailable" : "generic" };
      }
    }
  }
  const view = await runApp(cartService.view(owner, locale));
  if (view.lines.length === 0 && Astro.request.method !== "POST") return Astro.redirect(shopPaths.cart(locale), 303);
  const preview = await runApp(checkoutPreview(view, (values.country ?? "").trim().toUpperCase(), values.shippingMethod ?? ""));
  const timestamp = await runApp(formTimestampToken);
  return { locale, view, values: { ...values, country: preview.country, shippingMethod: preview.chosen.method }, errors, notice, preview, timestamp };
}

export async function orderPage(Astro: AstroGlobal) {
  const locale = toLocale(Astro.params.lang);
  const id = Astro.params.id ?? "";
  privatePage(Astro);
  let token = Astro.url.searchParams.get("t") ?? "";
  let notice: Notice = null;
  let returnNotice: ReturnNotice = null;
  let returnValues: { reason: string; note: string; quantities: Record<string, string> } | null = null;
  if (Astro.request.method === "POST") {
    const fd = await Astro.request.formData();
    token = str(fd, "t") || token;
    if (str(fd, "intent") === "return") {
      returnValues = { reason: str(fd, "reason"), note: str(fd, "note"), quantities: returnQuantitiesOf(fd.entries()) };
      const r = await runAppResult(requestOrderReturn(id, token, returnValues, {
        ip: extractIp(Astro.request.headers, Astro.clientAddress), userAgent: Astro.request.headers.get("user-agent"), locale,
      }));
      if (r.ok && r.value.kind === "requested") return Astro.redirect(`${shopPaths.order(locale, id, token)}&returned=${encodeURIComponent(r.value.number)}#order-returns`, 303);
      if (r.ok && r.value.kind === "rateLimited") {
        Astro.response.status = 429;
        Astro.response.headers.set("retry-after", String(r.value.retryAfterSeconds));
        returnNotice = { kind: "error", text: "rateLimited" };
      } else if (r.ok && r.value.kind === "invalid") {
        Astro.response.status = 422;
        returnNotice = { kind: "error", text: r.value.problem };
      } else if (r.ok && r.value.kind === "notEligible") {
        Astro.response.status = 409;
        returnNotice = { kind: "error", text: "notEligible" };
      } else if (!r.ok && (r.error as { _tag?: string })._tag === "InvalidLink") {
        Astro.response.status = 404;
      } else {
        Astro.response.status = 500;
        returnNotice = { kind: "error", text: "generic" };
      }
    } else {
      const pay = await runAppResult(payOrder(id, token, locale));
      if (pay.ok && pay.value) return Astro.redirect(pay.value, 303);
      Astro.response.status = pay.ok ? 409 : 500;
      notice = { kind: "error", text: "payUnavailable" };
    }
  }
  const found = await runApp(publicOrder(id, token));
  if (!found && (Astro.response.status ?? 200) < 400) Astro.response.status = 404;
  const q = Astro.url.searchParams;
  if (!notice && found && q.get("paid") === "1" && found.order.status === "PENDING_PAYMENT") notice = { kind: "success", text: "paymentReturn" };
  if (!notice && found && q.get("cancelled") === "1" && orderPayable(found.order)) notice = { kind: "error", text: "paymentCancelled" };
  const returns = found ? await runApp(publicOrderReturns(found.order)) : null;
  const returned = q.get("returned") ?? "";
  if (!returnNotice && returns && returned && returns.existing.some((row) => row.number === returned)) returnNotice = { kind: "success", text: "requested", number: returned };
  return { locale, found, token, notice, payable: !!found && orderPayable(found.order), returns, returnNotice, returnValues };
}
