import { Effect } from 'effect';
import { z } from 'astro/zod';
import { apiRoute } from '@/lib/effect/http';
import { rateLimit, retryAfterSeconds } from '@/lib/effect/route';
import { Mailer } from '@smtp/mailer';
import { logAuditEvent, extractIp } from '@/lib/audit';
import { contactFormTemplate } from '@smtp/templates/contact-form';
import { sanitizeHtml } from '@/lib/sanitize';
import { LOCALES, type Locale } from '@i18n/config';

export const prerender = false;

const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(100).transform((v) => sanitizeHtml(v)),
  lastName: z.string().trim().min(1).max(100).transform((v) => sanitizeHtml(v)),
  email: z.email().max(254),
  phone: z.string().trim().min(1).max(30).transform((v) => sanitizeHtml(v)),
  reason: z.string().trim().min(1).max(100).transform((v) => sanitizeHtml(v)),
  message: z.string().trim().min(10).max(5000).transform((v) => sanitizeHtml(v)),
  urgent: z.boolean().default(false),
  locale: z.enum(LOCALES).default('fr'),
});

export const POST = apiRoute(({ request, clientAddress }) =>
  Effect.gen(function* () {
    const ip = extractIp(request.headers, clientAddress);
    // Limite par IP si disponible, sinon seau global plus strict (TRUST_PROXY absent).
    const rl = yield* rateLimit(ip ? `contact:${ip}` : 'contact:__global__', ip ? { window: 300, max: 3 } : { window: 300, max: 10 });
    if (!rl.allowed) return Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': retryAfterSeconds(rl) } });

    const body = yield* Effect.tryPromise(() => request.json() as Promise<unknown>).pipe(Effect.option);
    if (body._tag === 'None') return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
    const parsed = contactSchema.safeParse(body.value);
    if (!parsed.success) return Response.json({ error: 'VALIDATION_ERROR', details: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
    const data = parsed.data;

    const adminEmail = process.env.CONTACT_EMAIL ?? process.env.SMTP_FROM_EMAIL;
    if (!adminEmail) {
      yield* Effect.logError('[contact] CONTACT_EMAIL and SMTP_FROM_EMAIL not set — cannot deliver contact form');
      return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    }
    const template = contactFormTemplate({
      locale: data.locale as Locale,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      reason: data.reason,
      message: data.message,
      urgent: data.urgent,
      ipAddress: ip,
    });
    const mailer = yield* Mailer;
    const sent = yield* mailer.send({ to: adminEmail, subject: template.subject, html: template.html, text: template.text }).pipe(Effect.result);
    if (sent._tag === 'Failure') {
      yield* Effect.logError('[contact] Failed to send contact email', sent.failure.cause);
      return Response.json({ error: 'SEND_FAILED' }, { status: 500 });
    }
    void logAuditEvent({
      userId: null,
      action: 'CONTACT_FORM_SUBMIT',
      resource: 'contact_form',
      resourceId: null,
      metadata: { reason: data.reason, urgent: data.urgent },
      ipAddress: ip,
      userAgent: request.headers.get('user-agent'),
    });
    return Response.json({ ok: true }, { status: 200 });
  }),
);
