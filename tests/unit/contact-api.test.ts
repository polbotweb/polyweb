import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Unit tests for /api/contact endpoint logic.
 * We test the contactSchema validation and handler behavior by importing
 * the schema indirectly and testing the validation patterns.
 */

// We cannot directly import the Astro APIRoute, so we test the validation
// schema and handler behavior patterns.
import { z } from 'astro/zod';
import { sanitizeHtml } from '@/lib/sanitize';
import { checkRateLimit, resetRateLimiter } from '@/lib/rate-limit';

// Reproduce the contact schema exactly as in the endpoint
const contactSchema = z.object({
  firstName: z.string().min(1).max(100).transform((v) => sanitizeHtml(v)),
  lastName: z.string().min(1).max(100).transform((v) => sanitizeHtml(v)),
  email: z.email().max(254),
  phone: z.string().min(1).max(30).transform((v) => sanitizeHtml(v)),
  reason: z.string().min(1).max(100).transform((v) => sanitizeHtml(v)),
  message: z.string().min(10).max(5000).transform((v) => sanitizeHtml(v)),
  urgent: z.boolean().default(false),
  locale: z.enum(['fr', 'en', 'es', 'ar']).default('fr'),
});

describe('/api/contact — validation', () => {
  it('accepts valid contact form data', () => {
    const result = contactSchema.safeParse({
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'jean@example.com',
      phone: '+33 1 23 45 67 89',
      reason: 'Question',
      message: 'Bonjour, je souhaite en savoir plus sur vos services.',
      urgent: false,
      locale: 'fr',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = contactSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = Object.keys(z.flattenError(result.error).fieldErrors);
      expect(fields).toContain('firstName');
      expect(fields).toContain('email');
      expect(fields).toContain('message');
    }
  });

  it('rejects invalid email', () => {
    const result = contactSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      email: 'not-an-email',
      phone: '123',
      reason: 'Test',
      message: 'This message is long enough to pass validation.',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message shorter than 10 chars', () => {
    const result = contactSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      phone: '123',
      reason: 'Test',
      message: 'Short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message longer than 5000 chars', () => {
    const result = contactSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      phone: '123',
      reason: 'Test',
      message: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('sanitizes XSS in firstName', () => {
    const result = contactSchema.safeParse({
      firstName: '<script>alert(1)</script>Jean',
      lastName: 'Dupont',
      email: 'jean@example.com',
      phone: '01234',
      reason: 'Info',
      message: 'Un message suffisamment long pour passer.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).not.toContain('<script>');
      expect(result.data.firstName).toContain('Jean');
    }
  });

  it('defaults urgent to false', () => {
    const result = contactSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      phone: '123',
      reason: 'Test',
      message: 'Long enough message content here.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.urgent).toBe(false);
    }
  });

  it('defaults locale to fr', () => {
    const result = contactSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      phone: '123',
      reason: 'Test',
      message: 'Long enough message content here.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe('fr');
    }
  });

  it('rejects invalid locale', () => {
    const result = contactSchema.safeParse({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      phone: '123',
      reason: 'Test',
      message: 'Long enough message content here.',
      locale: 'de',
    });
    expect(result.success).toBe(false);
  });

  it('rejects firstName longer than 100 chars', () => {
    const result = contactSchema.safeParse({
      firstName: 'A'.repeat(101),
      lastName: 'B',
      email: 'a@b.com',
      phone: '123',
      reason: 'Test',
      message: 'Long enough message content here.',
    });
    expect(result.success).toBe(false);
  });
});

describe('/api/contact — rate limiting', () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it('allows requests within the limit', () => {
    for (let i = 0; i < 3; i++) {
      const rl = checkRateLimit('contact:test-ip', { window: 300, max: 3 });
      expect(rl.allowed).toBe(true);
    }
  });

  it('blocks requests exceeding the limit', () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit('contact:test-ip-2', { window: 300, max: 3 });
    }
    const rl = checkRateLimit('contact:test-ip-2', { window: 300, max: 3 });
    expect(rl.allowed).toBe(false);
    expect(rl.resetAt).toBeGreaterThan(Date.now());
  });
});
