import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq, desc } from 'drizzle-orm';
import { getDrizzle } from '@database/drizzle';
import { auditLog } from '@database/schemas';
import { logAuditEvent, extractIp } from '@/lib/audit';
import { checkRateLimit, resetRateLimiter } from '@/lib/rate-limit';
import { sanitizeHtml } from '@/lib/sanitize';
import { contactFormTemplate } from '@smtp/templates/contact-form';
import { z } from 'astro/zod';
import { LOCALES, type Locale } from '@i18n/config';

/**
 * Integration tests for the /api/contact endpoint.
 *
 * We can't import the Astro APIRoute handler directly (requires Astro runtime),
 * so we test the full pipeline of logic used by the handler:
 *   1. Zod validation + DOMPurify sanitisation
 *   2. Rate limiting (real in-memory store)
 *   3. Email template generation with sanitised data
 *   4. Audit event written to PostgreSQL
 *
 * SMTP sending is NOT tested here (covered by unit/send-email.test.ts).
 */

// Reproduce the exact schema from src/pages/api/contact.ts
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

const VALID_BODY = {
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'jean.dupont@example.com',
  phone: '+33 6 12 34 56 78',
  reason: 'Demande de devis',
  message: 'Bonjour, je souhaite en savoir plus sur vos prestations.',
  urgent: false,
  locale: 'fr',
};

describe('/api/contact — integration pipeline', () => {
  let insertedAuditIds: string[] = [];

  beforeEach(() => {
    resetRateLimiter();
  });

  afterEach(async () => {
    // Clean up audit rows created by tests
    if (insertedAuditIds.length > 0) {
      const db = getDrizzle();
      for (const id of insertedAuditIds) {
        await db.delete(auditLog).where(eq(auditLog.id, id)).catch(() => {});
      }
      insertedAuditIds = [];
    }
  });

  // ─── Validation + Sanitisation ───────────────────────────────────

  it('validates and sanitises a well-formed contact submission', () => {
    const parsed = contactSchema.safeParse(VALID_BODY);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.firstName).toBe('Jean');
      expect(parsed.data.email).toBe('jean.dupont@example.com');
      expect(parsed.data.locale).toBe('fr');
    }
  });

  it('strips XSS from all text fields via DOMPurify', () => {
    const xssBody = {
      ...VALID_BODY,
      firstName: '<script>alert("xss")</script>Jean',
      lastName: '<img src=x onerror=alert(1)>Dupont',
      phone: '<svg onload=alert(1)>0600',
      reason: '"><marquee>Info',
      message: '<iframe src="evil.com"></iframe>Bonjour, ceci est un message long.',
    };
    const parsed = contactSchema.safeParse(xssBody);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.firstName).not.toContain('<script>');
      expect(parsed.data.firstName).toContain('Jean');
      // DOMPurify keeps <img> (in ALLOWED_TAGS) but strips onerror attribute
      expect(parsed.data.lastName).not.toContain('onerror');
      expect(parsed.data.lastName).toContain('Dupont');
      expect(parsed.data.phone).not.toContain('onload');
      expect(parsed.data.reason).not.toContain('<marquee');
      expect(parsed.data.message).not.toContain('<iframe');
    }
  });

  it('rejects non-JSON body (simulated via invalid input)', () => {
    const parsed = contactSchema.safeParse('not json');
    expect(parsed.success).toBe(false);
  });

  it('rejects all 4 invalid locales', () => {
    for (const locale of ['de', 'it', 'ru', 'zh']) {
      const parsed = contactSchema.safeParse({ ...VALID_BODY, locale });
      expect(parsed.success).toBe(false);
    }
  });

  it('accepts all 4 valid locales', () => {
    for (const locale of ['fr', 'en', 'es', 'ar']) {
      const parsed = contactSchema.safeParse({ ...VALID_BODY, locale });
      expect(parsed.success).toBe(true);
    }
  });

  // ─── Rate limiting (real store) ──────────────────────────────────

  it('enforces rate limit: 3 per 300s per IP, then blocks', () => {
    const ip = '198.51.100.42';
    const key = `contact:${ip}`;
    const opts = { window: 300, max: 3 };

    for (let i = 0; i < 3; i++) {
      const rl = checkRateLimit(key, opts);
      expect(rl.allowed).toBe(true);
    }

    const blocked = checkRateLimit(key, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetAt).toBeGreaterThan(Date.now());
  });

  it('uses tighter global bucket when no IP is available', () => {
    const key = 'contact:__global__';
    const opts = { window: 300, max: 10 };

    for (let i = 0; i < 10; i++) {
      const rl = checkRateLimit(key, opts);
      expect(rl.allowed).toBe(true);
    }

    const blocked = checkRateLimit(key, opts);
    expect(blocked.allowed).toBe(false);
  });

  // ─── IP extraction ──────────────────────────────────────────────

  it('extractIp uses x-forwarded-for when TRUST_PROXY=true', () => {
    const original = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = 'true';
    try {
      const headers = new Headers({ 'x-forwarded-for': '203.0.113.50, 10.0.0.1' });
      expect(extractIp(headers)).toBe('203.0.113.50');
    } finally {
      process.env.TRUST_PROXY = original;
    }
  });

  it('extractIp returns null when no proxy and no clientAddress', () => {
    const original = process.env.TRUST_PROXY;
    delete process.env.TRUST_PROXY;
    try {
      const headers = new Headers({ 'x-forwarded-for': '203.0.113.50' });
      expect(extractIp(headers)).toBeNull();
    } finally {
      process.env.TRUST_PROXY = original;
    }
  });

  // ─── Email template generation ──────────────────────────────────

  it('generates a complete email template from validated data', () => {
    const parsed = contactSchema.safeParse(VALID_BODY);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const template = contactFormTemplate({
      locale: parsed.data.locale as Locale,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      reason: parsed.data.reason,
      message: parsed.data.message,
      urgent: parsed.data.urgent,
      ipAddress: '127.0.0.1',
    });

    expect(template.subject).toBeTruthy();
    expect(template.html).toContain('Jean Dupont');
    expect(template.html).toContain('jean.dupont@example.com');
    expect(template.text).toContain('Jean Dupont');
  });

  it('generates urgent email template with URGENT badge', () => {
    const template = contactFormTemplate({
      locale: 'fr',
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@test.com',
      phone: '01234',
      reason: 'Urgence',
      message: 'Ce message est urgent et nécessite une attention immédiate.',
      urgent: true,
      ipAddress: null,
    });
    expect(template.subject).toContain('URGENT');
    expect(template.html).toContain('URGENT');
  });

  // ─── Audit log written to PostgreSQL ────────────────────────────

  it('writes CONTACT_FORM_SUBMIT audit event to database', async () => {
    const db = getDrizzle();

    await logAuditEvent({
      userId: null,
      action: 'CONTACT_FORM_SUBMIT',
      resource: 'contact_form',
      resourceId: null,
      metadata: { reason: 'Demande de devis', urgent: false },
      ipAddress: '198.51.100.42',
      userAgent: 'vitest-integration',
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'CONTACT_FORM_SUBMIT'))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(rows.length).toBe(1);
    insertedAuditIds.push(rows[0].id);

    const row = rows[0];
    expect(row.action).toBe('CONTACT_FORM_SUBMIT');
    expect(row.resource).toBe('contact_form');
    expect(row.userId).toBeNull();
    expect(row.ipAddress).toBe('198.51.100.42');
    expect(row.userAgent).toBe('vitest-integration');

    const meta = row.metadata as Record<string, unknown>;
    expect(meta.reason).toBe('Demande de devis');
    expect(meta.urgent).toBe(false);
  });

  // ─── Full pipeline: validate → sanitise → template → audit ─────

  it('end-to-end: XSS payload → sanitised → safe template → audit', async () => {
    const db = getDrizzle();
    const xssPayload = {
      firstName: '<script>steal()</script>Hacker',
      lastName: 'Evil<img onerror=alert(1)>',
      email: 'legit@example.com',
      phone: '+1 555 0100',
      reason: 'Test"><svg/onload=evil()>',
      message: 'This is a legitimate message with enough length to pass. <script>document.cookie</script>',
      urgent: true,
      locale: 'en',
    };

    // Step 1: Validate + sanitise
    const parsed = contactSchema.safeParse(xssPayload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    // Verify XSS stripped (DOMPurify keeps allowed tags like <img> but removes dangerous attributes)
    expect(parsed.data.firstName).not.toContain('<script>');
    expect(parsed.data.lastName).not.toContain('onerror');
    expect(parsed.data.reason).not.toContain('onload');
    expect(parsed.data.message).not.toContain('<script>');

    // Step 2: Generate email template with sanitised data
    const template = contactFormTemplate({
      locale: parsed.data.locale as Locale,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      reason: parsed.data.reason,
      message: parsed.data.message,
      urgent: parsed.data.urgent,
      ipAddress: '198.51.100.99',
    });

    // Template should not contain any executable content
    expect(template.html).not.toContain('<script>');
    expect(template.html).not.toContain('onerror=');
    expect(template.html).not.toContain('onload=');
    expect(template.subject).toContain('URGENT');

    // Step 3: Write audit event
    await logAuditEvent({
      userId: null,
      action: 'CONTACT_FORM_SUBMIT',
      resource: 'contact_form',
      resourceId: null,
      metadata: { reason: parsed.data.reason, urgent: parsed.data.urgent },
      ipAddress: '198.51.100.99',
      userAgent: 'vitest-e2e-pipeline',
    });

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'CONTACT_FORM_SUBMIT'))
      .orderBy(desc(auditLog.createdAt))
      .limit(1);

    expect(rows.length).toBe(1);
    insertedAuditIds.push(rows[0].id);
    expect(rows[0].ipAddress).toBe('198.51.100.99');
    expect(rows[0].userAgent).toBe('vitest-e2e-pipeline');
    const meta = rows[0].metadata as Record<string, unknown>;
    expect(meta.urgent).toBe(true);
    // Reason in metadata should be the sanitised version
    expect(String(meta.reason)).not.toContain('<svg');
  });
});
