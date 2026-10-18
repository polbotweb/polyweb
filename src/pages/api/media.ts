import type { APIRoute } from "astro";
import { listUploads } from "@/media/list";
import type { UploadType } from "@/media/types";
import { UPLOAD_DIRS } from "@/media/types";

export const prerender = false;

const VALID_TYPES = new Set(Object.keys(UPLOAD_DIRS));

/**
 * GET /api/media?type=avatar|logo|site
 * List uploaded media files. Requires admin auth.
 */
export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const typeParam = context.url.searchParams.get("type");
  const type = typeParam && VALID_TYPES.has(typeParam) ? (typeParam as UploadType) : undefined;

  const files = await listUploads(type);

  return new Response(JSON.stringify({ files, total: files.length }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
