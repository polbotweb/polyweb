import type { APIRoute } from "astro";
import { getDrizzle } from "@database/drizzle";
import { handleCrud } from "@/core/crud/engine";
import { crudResources } from "@/generated/crud";
import { checkRateLimit } from "@/lib/rate-limit";

export const prerender = false;

/** API CRUD générée (`pnpm api:generate`) : /api/crud/<ressource>[/<id>]. */
const handler: APIRoute = async ({ params, request, locals, clientAddress, url }) => {
  const [resourceId, id, ...rest] = (params.path ?? "").split("/").filter(Boolean);
  const registration = resourceId ? crudResources[resourceId] : undefined;
  if (!registration || rest.length > 0) return json({ error: "NOT_FOUND" }, 404);

  const rl = checkRateLimit(`crud_${clientAddress}`, { window: 60, max: 120 });
  if (!rl.allowed) return json({ error: "RATE_LIMITED" }, 429);

  let body: unknown;
  if (request.method === "POST" || request.method === "PATCH" || request.method === "PUT") {
    if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "UNSUPPORTED_MEDIA_TYPE" }, 415);
    try { body = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
  }

  const user = locals.user;
  const result = await handleCrud(registration, {
    method: request.method,
    id: id ?? null,
    searchParams: url.searchParams,
    body,
    actor: user ? { id: user.id, role: user.role, banned: user.banned } : null,
    hasPermission: async (resource, action) => {
      if (!user) return false;
      const { auth } = await import("@/lib/auth");
      const r = await auth.api.userHasPermission({ body: { userId: user.id, permissions: { [resource]: [action] } as Record<string, string[]> } });
      return r.success;
    },
  }, getDrizzle());
  return result.status === 204 ? new Response(null, { status: 204 }) : json(result.body, result.status);
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
