import { auth } from "@/lib/auth";
import { LOCALES } from "@/i18n/config";
import { bootstrapModules } from "@/lib/cms/bootstrap";
import { ensurePluginsSynced } from "@/core/plugins/host";
import { observeRequest } from "@/lib/observability/request";
import "@/plugins";
import { Effect } from "effect";
import { requestHost, resolveSession, resolveSite, serviceUnavailable } from "@/lib/http/request-context";
import { defineMiddleware } from "astro:middleware";
import { isForbiddenCrossOriginRequest } from "@/lib/security/origin-check";

export const onRequest = defineMiddleware(async (context, next) => {
  // CSRF : contrôle d'Origin (remplace security.checkOrigin, cf. origin-check.ts)
  if (!context.isPrerendered && isForbiddenCrossOriginRequest(context.request, context.url)) {
    return new Response(`Cross-site ${context.request.method} form submissions are forbidden`, { status: 403 });
  }

  bootstrapModules();
  if (!context.isPrerendered) await ensurePluginsSynced();

  // ─── Locale guard — reject invalid [lang] segments with 404 ─────
  const pathSegments = new URL(context.request.url).pathname.split('/').filter(Boolean);
  const maybeLang = pathSegments[0];
  if (maybeLang && /^[a-z]{2}$/.test(maybeLang) && !(LOCALES as readonly string[]).includes(maybeLang)) {
    return new Response('Not Found', { status: 404 });
  }

  // Session (timeout 5 s → 503) et site courant : programme Effect (src/lib/http/request-context.ts).
  const session = await Effect.runPromise(resolveSession(() => auth.api.getSession({ headers: context.request.headers })));
  if (session._tag === 'TimedOut') return serviceUnavailable();
  context.locals.user = session.session?.user ?? null;
  context.locals.session = session.session?.session ?? null;

  // ─── Multi-site : site courant d'après le Host (cache 30 s) ─────
  context.locals.site = await Effect.runPromise(resolveSite(requestHost(context.request.headers, process.env.TRUST_PROXY === "true")));

  const response = await observeRequest(context, next);
  const url = new URL(context.request.url);
  const lowerPath = url.pathname.toLowerCase();
  if (lowerPath.startsWith('/uploads/') && (lowerPath.endsWith('.svg') || lowerPath.endsWith('.svgz'))) {
    response.headers.set('Content-Disposition', 'attachment');
    response.headers.set('Content-Type', 'image/svg+xml');
  }

  const securityHeaders: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-XSS-Protection': '0',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
  };

  // API publique (brique c) : consommable cross-origin (lecture sans cookies).
  if (lowerPath.startsWith('/api/v1/')) securityHeaders['Cross-Origin-Resource-Policy'] = 'cross-origin';

  for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
  return response;
});
