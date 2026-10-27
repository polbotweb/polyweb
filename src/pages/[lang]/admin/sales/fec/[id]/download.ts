/**
 * GET /<lang>/admin/sales/fec/<id>/download — téléchargement d'un export FEC prêt.
 * Garde : session + permission `sales:read` dans le tenant de l'export (lu en base) ; limite de
 * débit par utilisateur. Le fichier est relu en stockage privé et son SHA-256 revérifié avant
 * envoi (altération → 500 journalisée). Journal d'audit `SALES_FEC_DOWNLOAD`.
 * Réponse : ISO 8859-15, `attachment`, `private, no-store`, `nosniff`, en-tête `X-Content-SHA256`.
 */
import type { APIRoute } from "astro";
import { Effect } from "effect";
import { ActionFailure, actionRateLimit } from "@/lib/effect/action";
import { extractIp, logAuditEventEffect } from "@/lib/audit";
import { PrivateStorage, privateStorage } from "@/lib/storage/private";
import { FEC_CONTENT_TYPE, sha256Hex } from "@/modules/sales/domain/fec";
import { fecExportOf } from "@/modules/sales/services/fecExport.service";
import { requireSalesPermission } from "@/modules/sales/permissions";

export const prerender = false;

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, TOO_MANY_REQUESTS: 429 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  // Pas de session : refus avant toute lecture (l'existence d'un export ne se sonde pas).
  if (!context.locals.user) return new Response(null, { status: 401 });
  if (!UUID.test(id)) return new Response(null, { status: 404 });
  const program = Effect.gen(function* () {
    const row = yield* fecExportOf(id);
    if (!row) return new Response(null, { status: 404 });
    const user = yield* requireSalesPermission(context, ["read"], row.organizationId);
    if (row.status !== "READY" || !row.storageKey || !row.filename || !row.sha256) return new Response(null, { status: 404 });
    yield* actionRateLimit(user.id, "sales:fec-download", { window: 60, max: 30 });
    const storage = yield* PrivateStorage;
    const bytes = yield* storage.get(row.storageKey);
    if (sha256Hex(bytes) !== row.sha256) {
      yield* Effect.logError("sales.fec: empreinte du fichier stocké différente").pipe(Effect.annotateLogs({ exportId: row.id, storageKey: row.storageKey }));
      return new Response(null, { status: 500 });
    }
    yield* logAuditEventEffect({
      userId: user.id, action: "SALES_FEC_DOWNLOAD", resource: "sales_fec_export", resourceId: row.id,
      metadata: { organizationId: row.organizationId, period: row.period, sha256: row.sha256 },
      ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent"),
    });
    return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
      headers: {
        "Content-Type": FEC_CONTENT_TYPE,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${row.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Content-SHA256": row.sha256,
      },
    });
  }).pipe(Effect.provideService(PrivateStorage, privateStorage()));
  const result = await Effect.runPromise(Effect.result(program));
  if (result._tag === "Success") return result.success;
  const error = result.failure;
  if (error instanceof ActionFailure) return new Response(null, { status: STATUS[error.code] ?? 500 });
  return new Response(null, { status: 500 });
};
