/**
 * Contrôleurs des pages publiques de réservation (plateforme et organisation partagent la logique).
 * Chaque fonction renvoie soit une `Response` (redirection 303 après POST, 404), soit les props de
 * la vue. Les POST sont des formulaires HTML classiques (aucun JS requis → CSP stricte) ; l'origine
 * est contrôlée globalement par le middleware (`isForbiddenCrossOriginRequest`).
 */
import type { AstroGlobal } from "astro";
import { toLocale } from "@i18n/utils";
import { runApp, runAppResult } from "@/lib/effect/http";
import { extractIp } from "@/lib/audit";
import { formTimestampToken } from "@/modules/forms/domain/forms";
import type { GuestField } from "../domain/guest";
import { bookableRange, cancelGuestBooking, guestBooking, manageUrlPath, publicBasePath, publicDay, publicResource, publicResources, resolveTenant, submitGuestBooking, type PublicTenant } from "./flow";

export type NoticeKey = "errorSummary" | "slotTaken" | "rateLimited" | "generic" | "notCancellable" | "cancelled" | "created";
export type Notice = { readonly kind: "success" | "error"; readonly text: NoticeKey } | null;
const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
const privatePage = (Astro: AstroGlobal) => Astro.response.headers.set("cache-control", "private, no-store");

/** Tenant d'une page : plateforme ou organisation du segment `[organization]` (`null` → 404). */
export const pageTenant = async (Astro: AstroGlobal): Promise<PublicTenant | null> => {
  const slug = Astro.params.organization;
  if (!slug) return { organizationId: null, slug: null, name: null };
  return runApp(resolveTenant(slug));
};

export async function listPage(Astro: AstroGlobal, tenant: PublicTenant) {
  const locale = toLocale(Astro.params.lang);
  const resources = await runApp(publicResources(tenant));
  privatePage(Astro);
  return { locale, tenant, resources, base: publicBasePath(locale, tenant) };
}

export async function resourcePage(Astro: AstroGlobal, tenant: PublicTenant) {
  const locale = toLocale(Astro.params.lang);
  const resource = await runApp(publicResource(tenant, Astro.params.code ?? ""));
  if (!resource) return Astro.rewrite("/404");
  const base = publicBasePath(locale, tenant);
  const now = new Date();
  let date = Astro.url.searchParams.get("date") ?? "";
  let values: Record<string, string> = {};
  let errors: readonly GuestField[] = [];
  let notice: Notice = null;
  let sent = Astro.url.searchParams.get("sent") === "1";

  if (Astro.request.method === "POST") {
    const fd = await Astro.request.formData();
    values = Object.fromEntries(["startsAt", "customerName", "customerEmail", "customerPhone", "partySize", "notes"].map((k) => [k, str(fd, k)]));
    date = str(fd, "date") || date;
    const r = await runAppResult(submitGuestBooking(tenant, resource, { ...values, _hp: str(fd, "_hp"), _ts: str(fd, "_ts") }, {
      ip: extractIp(Astro.request.headers, Astro.clientAddress), userAgent: Astro.request.headers.get("user-agent"), locale, now,
    }));
    if (r.ok) {
      if (r.value.kind === "discarded") return Astro.redirect(`${base}/${encodeURIComponent(resource.code)}?sent=1`, 303);
      return Astro.redirect(`${manageUrlPath(locale, tenant, r.value.id, r.value.token)}&created=1${r.value.emailSent ? "" : "&mail=0"}`, 303);
    }
    const e = r.error as { _tag?: string; fields?: readonly GuestField[]; retryAfterSeconds?: number; code?: string };
    if (e._tag === "InvalidGuestError") {
      errors = e.fields ?? [];
      Astro.response.status = 422;
      notice = { kind: "error", text: "errorSummary" };
    } else if (e._tag === "SlotUnavailableError") {
      Astro.response.status = 409;
      notice = { kind: "error", text: "slotTaken" };
      values = { ...values, startsAt: "" };
    } else if (e._tag === "RateLimitedError") {
      Astro.response.status = 429;
      Astro.response.headers.set("retry-after", String(e.retryAfterSeconds ?? 60));
      notice = { kind: "error", text: "rateLimited" };
    } else {
      Astro.response.status = 500;
      notice = { kind: "error", text: "generic" };
    }
    sent = false;
  }
  const day = await runApp(publicDay(tenant, resource, date || bookableRange(resource, now).min, now));
  const timestamp = await runApp(formTimestampToken);
  privatePage(Astro);
  return { locale, tenant, base, resource, day, dateRequested: date !== "", values, errors, notice, sent, timestamp };
}

export async function managePage(Astro: AstroGlobal, tenant: PublicTenant) {
  const locale = toLocale(Astro.params.lang);
  const id = Astro.params.id ?? "";
  const base = publicBasePath(locale, tenant);
  const meta = { ip: extractIp(Astro.request.headers, Astro.clientAddress), userAgent: Astro.request.headers.get("user-agent") };
  let token = Astro.url.searchParams.get("t") ?? "";
  let notice: Notice = null;
  // Le lien contient un secret : jamais en cache, jamais transmis en Referer, jamais indexé.
  privatePage(Astro);
  // Referrer-Policy : écrasé par le middleware, d’où la balise <meta name="referrer"> dans la page.
  Astro.response.headers.set("x-robots-tag", "noindex, nofollow");

  if (Astro.request.method === "POST") {
    const fd = await Astro.request.formData();
    token = str(fd, "t") || token;
    const r = await runAppResult(cancelGuestBooking(tenant, id, token, meta));
    if (r.ok && r.value) return Astro.redirect(`${manageUrlPath(locale, tenant, id, token)}&cancelled=1`, 303);
    if (r.ok) {
      Astro.response.status = 404;
    } else {
      const code = (r.error as { code?: string }).code;
      Astro.response.status = code === "BAD_REQUEST" ? 409 : 500;
      notice = { kind: "error", text: code === "BAD_REQUEST" ? "notCancellable" : "generic" };
    }
  }
  const booking = await runApp(guestBooking(tenant, id, token));
  if (!booking) Astro.response.status = 404;
  const cancellable = !!booking && (booking.status === "REQUESTED" || booking.status === "CONFIRMED") && booking.startsAt.getTime() > Date.now();
  const q = Astro.url.searchParams;
  if (!notice && booking && q.get("cancelled") === "1") notice = { kind: "success", text: "cancelled" };
  if (!notice && booking && q.get("created") === "1") notice = { kind: "success", text: "created" };
  return { locale, tenant, base, booking, token, cancellable, notice, mailFailed: q.get("mail") === "0" };
}
