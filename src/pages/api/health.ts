import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { access, constants } from "node:fs/promises";
import { checkConnection } from "@database/drizzle";
import { getCacheStats } from "@database/cache";
import { checkSmtpConfig } from "@/smtp/env";

export const prerender = false;

const startedAt = Date.now();
const HEALTH_TOKEN = process.env.HEALTH_TOKEN;

function isAuthorized(request: Request): boolean {
  // If no token configured, only allow from loopback (container probes)
  if (!HEALTH_TOKEN) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return false; // Proxied = external
    return true; // Direct = likely container probe
  }
  const bearer = request.headers.get('authorization');
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (token.length !== HEALTH_TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(HEALTH_TOKEN));
}

export const GET: APIRoute = async ({ request }) => {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  try {
    const [db, smtp, uploadsOk] = await Promise.all([
      checkConnection(),
      Promise.resolve(checkSmtpConfig()),
      access('public/uploads', constants.W_OK).then(() => true, () => false),
    ]);
    const uptime = Math.floor((Date.now() - startedAt) / 1000);
    const cache = getCacheStats();

    const allOk = db.ok && smtp.ok && uploadsOk;
    const status = allOk ? 200 : 503;
    const body = {
      status: allOk ? "ok" : "degraded",
      version: "0.0.1",
      uptime,
      timestamp: new Date().toISOString(),
      db: { ok: db.ok },
      smtp: { ok: smtp.ok, provider: smtp.provider },
      disk: { uploadsWritable: uploadsOk },
      cache: { size: cache.size, hits: cache.hits, misses: cache.misses },
    };

    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error('[health] Check failed:', err);
    return new Response(JSON.stringify({
      status: "error",
      version: "0.0.1",
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      db: { ok: false },
      smtp: { ok: false, provider: 'unknown' },
      disk: { uploadsWritable: false },
    }), {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }
};
