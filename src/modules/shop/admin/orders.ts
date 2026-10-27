/**
 * Contrôleurs SSR de l'administration des commandes (liste filtrée, fiche, transitions, liens).
 * Formulaires classiques (POST → 303) : aucun JS, CSP stricte ; l'origine des POST est contrôlée
 * par le middleware. Lecture : permission `shop:read` (vérifiée par la page) ; écriture :
 * `shop:update`, revérifiée ici à chaque POST. Commandes du tenant plateforme uniquement.
 */
import type { AstroGlobal } from "astro";
import { Effect } from "effect";
import { runApp, runAppResult } from "@/lib/effect/http";
import { extractIp, logAuditEventEffect } from "@/lib/audit";
import { isOrderStatus, ORDER_STATUSES, type OrderStatus } from "../domain/orders";
import { orderLinesOf, orderService, ORDERS_PAGE_SIZE, type OrderAdminFilters } from "../services/order.service";
import { hasShopPermission } from "../permissions";
import { SHOP_PUBLIC_ORGANIZATION } from "../public/flow";

export type AdminNotice = { readonly kind: "success" | "error"; readonly key: "done" | "forbidden" | "notFound" | "conflict" | "generic" | "invalidDate" } | null;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: string) => DATE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

/** Filtres de la liste depuis l'URL (valeurs invalides ignorées, signalées). */
export const orderFiltersFromUrl = (params: URLSearchParams) => {
  const status = params.get("status") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const filters: OrderAdminFilters = {
    ...(isOrderStatus(status) ? { status } : {}),
    ...(params.get("q")?.trim() ? { search: params.get("q")!.trim().slice(0, 100) } : {}),
    ...(isDate(from) ? { from } : {}),
    ...(isDate(to) ? { to } : {}),
  };
  const invalidDate = (from !== "" && !isDate(from)) || (to !== "" && !isDate(to));
  const page = /^\d{1,6}$/.test(params.get("page") ?? "") ? Math.max(1, Number(params.get("page"))) : 1;
  return { filters, invalidDate, page, raw: { status: filters.status ?? "", q: filters.search ?? "", from, to } };
};

export async function ordersAdminList(Astro: AstroGlobal) {
  const parsed = orderFiltersFromUrl(Astro.url.searchParams);
  const { rows, total } = await runApp(orderService.list(SHOP_PUBLIC_ORGANIZATION, parsed.filters, parsed.page));
  return { ...parsed, rows, total, totalPages: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)), statuses: ORDER_STATUSES };
}

const failureKey = (error: unknown): NonNullable<AdminNotice>["key"] => {
  const code = (error as { code?: string } | null)?.code;
  return code === "FORBIDDEN" ? "forbidden" : code === "NOT_FOUND" ? "notFound" : code === "CONFLICT" ? "conflict" : "generic";
};

export async function orderAdminDetail(Astro: AstroGlobal) {
  const id = Astro.params.id ?? "";
  const canUpdate = await hasShopPermission(Astro, ["update"]);
  let notice: AdminNotice = Astro.url.searchParams.get("done") === "1" ? { kind: "success", key: "done" } : null;

  if (Astro.request.method === "POST") {
    if (!canUpdate) {
      Astro.response.status = 403;
      notice = { kind: "error", key: "forbidden" };
    } else {
      const fd = await Astro.request.formData();
      const intent = fd.get("intent");
      const meta = { userId: Astro.locals.user?.id ?? null, ipAddress: extractIp(Astro.request.headers, Astro.clientAddress), userAgent: Astro.request.headers.get("user-agent") };
      const field = (k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };
      const effect = intent === "transition"
        ? Effect.gen(function* () {
          const to = field("to");
          if (!isOrderStatus(to)) return yield* Effect.fail({ code: "FORBIDDEN" });
          const updated = yield* orderService.transition(id, SHOP_PUBLIC_ORGANIZATION, to as OrderStatus);
          yield* logAuditEventEffect({ ...meta, action: "SHOP_ORDER_TRANSITION", resource: "order", resourceId: id, metadata: { number: updated.number, to } });
        })
        : intent === "link"
          ? Effect.gen(function* () {
            const links = { salesDocumentId: field("salesDocumentId").slice(0, 64) || null, shipmentId: field("shipmentId").slice(0, 64) || null };
            const updated = yield* orderService.link(id, SHOP_PUBLIC_ORGANIZATION, links);
            yield* logAuditEventEffect({ ...meta, action: "SHOP_ORDER_LINK", resource: "order", resourceId: id, metadata: { number: updated.number, ...links } });
          })
          : Effect.fail({ code: "FORBIDDEN" });
      const r = await runAppResult(effect);
      if (r.ok) return Astro.redirect(`${Astro.url.pathname}?done=1`, 303);
      const key = failureKey(r.error);
      Astro.response.status = key === "forbidden" ? 403 : key === "notFound" ? 404 : key === "conflict" ? 409 : 500;
      notice = { kind: "error", key };
    }
  }
  const order = await runApp(orderService.byId(id, SHOP_PUBLIC_ORGANIZATION));
  if (!order) return null;
  const lines = await runApp(orderLinesOf(order.id));
  return { order, lines, canUpdate, notice };
}
