/**
 * POST /api/purchasing/punchout/<cookie> — retour cXML PunchOutOrderMessage.
 * Authentifié par le cookie de session (HMAC du secret fournisseur, passé en `?mac=`).
 */
import type { APIRoute } from "astro";
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { ActionFailure } from "@/lib/effect/action";
import { punchOutMac } from "@/modules/purchasing/domain/punchout";
import { purchasingPunchoutSessions } from "@/modules/purchasing/schema/extended";
import { purchasingSuppliers } from "@/modules/purchasing/schema";
import { purchasingOpsService } from "@/modules/purchasing/services/ops.service";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const cookie = context.params.cookie ?? "";
  const mac = context.url.searchParams.get("mac") ?? "";
  const xml = await context.request.text();
  const program = Effect.gen(function* () {
    const [session] = yield* Effect.promise(() => getDrizzle().select().from(purchasingPunchoutSessions).where(eq(purchasingPunchoutSessions.buyerCookie, cookie)).limit(1));
    if (!session) return new Response("unknown session", { status: 404 });
    const [supplier] = yield* Effect.promise(() => getDrizzle().select().from(purchasingSuppliers).where(eq(purchasingSuppliers.id, session.supplierId)).limit(1));
    if (!supplier?.punchoutSecret || punchOutMac(cookie, supplier.punchoutSecret) !== mac) {
      return new Response("unauthorized", { status: 401 });
    }
    const result = yield* purchasingOpsService.completePunchOut(cookie, xml, supplier.punchoutSecret, session.createdBy ?? "punchout");
    return new Response(`OK ${result.order.id}`, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  });
  const result = await Effect.runPromise(Effect.result(program));
  if (result._tag === "Success") return result.success;
  const error = result.failure;
  if (error instanceof ActionFailure) {
    const table: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, BAD_REQUEST: 400, TOO_MANY_REQUESTS: 429 };
    const status = table[error.code] ?? 500;
    return new Response(error.message, { status });
  }
  return new Response("error", { status: 500 });
};
