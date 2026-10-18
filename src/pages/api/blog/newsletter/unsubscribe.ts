import { Effect } from 'effect';
import { extractIp } from '@/lib/audit';
import { apiRoute } from '@/lib/effect/http';
import { blogNewsletterService } from '@/lib/newsletter/blog-newsletter-service';

export const prerender = false;

const page = (success: boolean, message: string, status: number) => new Response(renderMessage(success, message), { status, headers: responseHeaders });

export const GET = apiRoute(({ url, request, clientAddress, site }) =>
  Effect.gen(function* () {
    const token = url.searchParams.get('token')?.trim();
    if (!token || token.length > 512) return page(false, 'Lien de désinscription invalide.', 400);
    // Anti-phishing : lien honoré uniquement sur l'origine de confiance (pas de Host injecté).
    if (site && url.origin !== site.origin) return page(false, 'Lien de désinscription invalide.', 400);
    const result = yield* Effect.tryPromise(() =>
      blogNewsletterService.unsubscribe({ token, audit: { ipAddress: extractIp(request.headers, clientAddress), userAgent: request.headers.get('user-agent') } }),
    ).pipe(Effect.result);
    if (result._tag === 'Failure') {
      const error = result.failure.cause;
      yield* Effect.logError('[newsletter] unsubscribe endpoint failed', { name: error instanceof Error ? error.name : 'UnknownError' });
      return page(false, 'Service temporairement indisponible.', 503);
    }
    if (!result.success.consumed) return page(false, 'Lien de désinscription invalide ou expiré.', 400);
    return page(true, 'Vous êtes désabonné de la newsletter. Vous pourrez vous réinscrire à tout moment.', 200);
  }),
);

const responseHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

function renderMessage(success: boolean, message: string): string {
  const color = success ? '#16a34a' : '#dc2626';
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Newsletter — Polyweb</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f8fafc;">
  <div style="max-width:420px;text-align:center;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="font-size:2.5rem;margin-bottom:.5rem;">${success ? '✅' : '⚠️'}</div>
    <p style="color:${color};font-size:1.125rem;font-weight:600;margin:0;">${message}</p>
    <p style="margin-top:1rem;"><a href="/" style="color:#6d28d9;">Retour à l'accueil</a></p>
  </div>
</body>
</html>`;
}
