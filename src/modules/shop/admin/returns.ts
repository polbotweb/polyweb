/**
 * Contrôleurs SSR des retours clients (RMA) : liste filtrée, fiche, actions du cycle de vie.
 * Formulaires classiques (POST → 303, aucun JS) ; l'origine des POST est contrôlée par le
 * middleware. Lecture : `shop:read` (vérifiée par la page) ; actions : `shop:update`, revérifiée
 * à chaque POST ; remboursement : en plus `payment:refund` sur le tenant du paiement.
 * Chaque action réussie est journalisée (audit) ; le résultat est affiché après redirection.
 */
import type { AstroGlobal } from "astro";
import { Effect } from "effect";
import { runApp, runAppResult } from "@/lib/effect/http";
import { requireTenantPermission } from "@/lib/effect/action";
import { extractIp, logAuditEventEffect } from "@/lib/audit";
import { isReturnStatus, RETURN_NOTE_MAX, RETURN_STATUSES } from "../domain/returns";
import type { ReturnAdminNoticeKey } from "../i18n/returns";
import { RETURNS_PAGE_SIZE, returnService } from "../services/return.service";
import { hasShopPermission } from "../permissions";
import { SHOP_PUBLIC_ORGANIZATION } from "../public/flow";

export type ReturnAdminNotice = { readonly kind: "success" | "error"; readonly key: ReturnAdminNoticeKey } | null;

const SUCCESS_KEYS: ReadonlySet<string> = new Set<ReturnAdminNoticeKey>(["approved", "rejected", "cancelled", "received", "inspected", "closed", "refunded", "refundPending", "refundFailed"]);
export const RETURN_NOTICE_PARAM = "done";

/** Filtres de la liste depuis l'URL (valeurs inconnues ignorées). */
export const returnFiltersFromUrl = (params: URLSearchParams) => {
  const status = params.get("status") ?? "";
  const search = params.get("q")?.trim().slice(0, 100) ?? "";
  const page = /^\d{1,6}$/.test(params.get("page") ?? "") ? Math.max(1, Number(params.get("page"))) : 1;
  return { filters: { ...(isReturnStatus(status) ? { status } : {}), ...(search ? { search } : {}) }, page, raw: { status: isReturnStatus(status) ? status : "", q: search } };
};

export async function returnsAdminList(Astro: AstroGlobal) {
  const parsed = returnFiltersFromUrl(Astro.url.searchParams);
  const { rows, total } = await runApp(returnService.list(SHOP_PUBLIC_ORGANIZATION, parsed.filters, parsed.page));
  return { ...parsed, rows, total, totalPages: Math.max(1, Math.ceil(total / RETURNS_PAGE_SIZE)), statuses: RETURN_STATUSES };
}

/** Clé de message d'un échec (codes métier, erreurs typées de core/refunds). */
export const returnFailureKey = (error: unknown): ReturnAdminNoticeKey => {
  const e = error as { _tag?: string; code?: string; message?: string } | null;
  switch (e?._tag) {
    case "RefundAmountExceededError": return "exceeded";
    case "PaymentsUnavailableError": return "unavailable";
    case "RefundNotAllowedError": return "conflict";
    case "RefundIdempotencyConflictError": return "conflict";
    default: break;
  }
  switch (e?.code) {
    case "FORBIDDEN": case "UNAUTHORIZED": return "forbidden";
    case "NOT_FOUND": return "notFound";
    case "CONFLICT": return "conflict";
    case "PRECONDITION_FAILED": return "noPayment";
    case "BAD_REQUEST": return "invalid";
    default: return "generic";
  }
};

const statusOf = (key: ReturnAdminNoticeKey) =>
  key === "forbidden" ? 403 : key === "notFound" ? 404 : key === "conflict" || key === "noPayment" || key === "exceeded" ? 409 : key === "invalid" ? 422 : key === "unavailable" ? 503 : 500;

const QUANTITY = /^\d{1,3}$/;

/** Saisie de l'inspection : `accepted:<ligne>` / `restocked:<ligne>` (entiers ; autre saisie → NaN, refusée par le service). */
export const inspectionOf = (fd: FormData, lineIds: readonly string[]) => ({
  lines: lineIds.map((lineId) => {
    const read = (k: string) => { const v = fd.get(`${k}:${lineId}`); const s = typeof v === "string" ? v.trim() : ""; return QUANTITY.test(s) ? Number(s) : Number.NaN; };
    return { lineId, accepted: read("accepted"), restocked: read("restocked") };
  }),
});

export async function returnAdminDetail(Astro: AstroGlobal) {
  const id = Astro.params.id ?? "";
  const canUpdate = await hasShopPermission(Astro, ["update"]);
  const done = Astro.url.searchParams.get(RETURN_NOTICE_PARAM) ?? "";
  let notice: ReturnAdminNotice = SUCCESS_KEYS.has(done)
    ? { kind: done === "refundFailed" ? "error" : "success", key: done as ReturnAdminNoticeKey } : null;

  if (Astro.request.method === "POST") {
    if (!canUpdate) {
      Astro.response.status = 403;
      notice = { kind: "error", key: "forbidden" };
    } else {
      const fd = await Astro.request.formData();
      const intent = fd.get("intent");
      const userId = Astro.locals.user?.id ?? "";
      const meta = { userId: userId || null, ipAddress: extractIp(Astro.request.headers, Astro.clientAddress), userAgent: Astro.request.headers.get("user-agent") };
      const adminNote = (() => { const v = fd.get("adminNote"); return typeof v === "string" ? v.trim().slice(0, RETURN_NOTE_MAX) || null : null; })();
      const transition = (key: ReturnAdminNoticeKey, run: Effect.Effect<{ readonly number: string; readonly status: string }, unknown>) =>
        run.pipe(
          Effect.tap((row) => logAuditEventEffect({ ...meta, action: "SHOP_RETURN_TRANSITION", resource: "order_return", resourceId: id, metadata: { number: row.number, to: row.status } })),
          Effect.as(key),
        );
      const effect =
        intent === "approve" ? transition("approved", returnService.approve(id, SHOP_PUBLIC_ORGANIZATION, userId))
        : intent === "reject" ? transition("rejected", returnService.reject(id, SHOP_PUBLIC_ORGANIZATION, adminNote))
        : intent === "cancel" ? transition("cancelled", returnService.cancel(id, SHOP_PUBLIC_ORGANIZATION))
        : intent === "receive" ? transition("received", returnService.receive(id, SHOP_PUBLIC_ORGANIZATION, userId))
        : intent === "inspect" ? Effect.gen(function* () {
          const found = yield* returnService.byId(id, SHOP_PUBLIC_ORGANIZATION);
          if (!found) return yield* Effect.fail({ code: "NOT_FOUND" });
          const input = { ...inspectionOf(fd, found.lines.map(({ line }) => line.id)), note: adminNote };
          const { updated, restocked } = yield* returnService.inspect(id, SHOP_PUBLIC_ORGANIZATION, userId, input);
          yield* logAuditEventEffect({ ...meta, action: "SHOP_RETURN_INSPECT", resource: "order_return", resourceId: id, metadata: { number: updated.number, to: updated.status, refundMinor: updated.refundMinor, restocked } });
          return updated.status === "CLOSED" ? "closed" as const : "inspected" as const;
        })
        : intent === "refund" ? Effect.gen(function* () {
          const found = yield* returnService.byId(id, SHOP_PUBLIC_ORGANIZATION);
          if (!found) return yield* Effect.fail({ code: "NOT_FOUND" });
          yield* requireTenantPermission(Astro, { payment: ["refund"] }, found.order.organizationId ?? null);
          const { returnRow, refund } = yield* returnService.refund(id, SHOP_PUBLIC_ORGANIZATION, userId);
          yield* logAuditEventEffect({ ...meta, action: "SHOP_RETURN_REFUND", resource: "order_return", resourceId: id, metadata: { number: returnRow.number, refundId: refund?.id ?? returnRow.refundId, status: refund?.status ?? "succeeded" } });
          return !refund || refund.status === "succeeded" ? "refunded" as const : refund.status === "pending" ? "refundPending" as const : "refundFailed" as const;
        })
        : Effect.fail({ code: "FORBIDDEN" });
      const r = await runAppResult(effect);
      if (r.ok) return Astro.redirect(`${Astro.url.pathname}?${RETURN_NOTICE_PARAM}=${r.value}`, 303);
      const key = returnFailureKey(r.error);
      Astro.response.status = statusOf(key);
      notice = { kind: "error", key };
    }
  }
  const found = await runApp(returnService.byId(id, SHOP_PUBLIC_ORGANIZATION));
  if (!found) return null;
  const canRefund = canUpdate && found.returnRow.status === "INSPECTED" && !!found.order.paymentId
    && (await runApp(requireTenantPermission(Astro, { payment: ["refund"] }, found.order.organizationId ?? null).pipe(Effect.as(true), Effect.orElseSucceed(() => false))));
  return { ...found, canUpdate, canRefund, notice };
}
