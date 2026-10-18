import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAuditEvent, extractIp } from '@/lib/audit';
import { sendEmail } from '@smtp/send';
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

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = extractIp(request.headers, clientAddress);

  // Rate-limit on IP if available, fallback to a global bucket (tighter limit)
  // so the endpoint still works when TRUST_PROXY is not set.
  const rlKey = ip ? `contact:${ip}` : 'contact:__global__';
  const rlOpts = ip ? { window: 300, max: 3 } : { window: 300, max: 10 };
  const rl = checkRateLimit(rlKey, rlOpts);
  if (!rl.allowed) {
    return Response.json(
      { error: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'VALIDATION_ERROR', details: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const adminEmail = process.env.CONTACT_EMAIL ?? process.env.SMTP_FROM_EMAIL;
  if (!adminEmail) {
    console.error('[contact] CONTACT_EMAIL and SMTP_FROM_EMAIL not set — cannot deliver contact form');
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

  try {
    await sendEmail({
      to: adminEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  } catch (err) {
    console.error('[contact] Failed to send contact email:', err);
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
};
