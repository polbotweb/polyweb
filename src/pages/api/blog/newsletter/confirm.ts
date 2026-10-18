import type { APIRoute } from 'astro';
import { extractIp } from '@/lib/audit';
import { blogNewsletterService } from '@/lib/newsletter/blog-newsletter-service';

export const prerender = false;

export const GET: APIRoute = async ({ url, request, clientAddress, site }) => {
  const token = url.searchParams.get('token')?.trim();
  if (!token || token.length > 512) {
    return new Response(renderMessage(false, 'Lien de confirmation invalide.'), {
      status: 400,
      headers: responseHeaders,
    });
  }

  // Anti-phishing: only honor the link if it was opened on the trusted
  // site origin. A Host-header-injected evil.com link is rejected.
  if (site && url.origin !== site.origin) {
    return new Response(renderMessage(false, 'Lien de confirmation invalide.'), {
      status: 400,
      headers: responseHeaders,
    });
  }

  try {
    const result = await blogNewsletterService.confirm({
      token,
      audit: {
        ipAddress: extractIp(request.headers, clientAddress),
        userAgent: request.headers.get('user-agent'),
      },
    });
    if (!result.consumed) {
      return new Response(renderMessage(false, 'Lien de confirmation invalide ou expiré.'), {
        status: 400,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    console.error('[newsletter] Confirmation endpoint failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return new Response(renderMessage(false, 'Service temporairement indisponible.'), {
      status: 503,
      headers: responseHeaders,
    });
  }

  return new Response(renderMessage(true, 'Votre inscription à la newsletter est confirmée. Merci !'), {
    status: 200,
    headers: responseHeaders,
  });
};

const responseHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

function renderMessage(success: boolean, message: string): string {
  const color = success ? '#16a34a' : '#dc2626';
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Newsletter — Atomic</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f8fafc;">
  <div style="max-width:420px;text-align:center;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    <div style="font-size:2.5rem;margin-bottom:.5rem;">${success ? '✅' : '⚠️'}</div>
    <p style="color:${color};font-size:1.125rem;font-weight:600;margin:0;">${message}</p>
    <p style="margin-top:1rem;"><a href="/" style="color:#6d28d9;">Retour à l'accueil</a></p>
  </div>
</body>
</html>`;
}
