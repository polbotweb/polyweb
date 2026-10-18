import { describe, it, expect } from 'vitest';
import { safeUrl, safeEmbedUrl } from '@lib/sanitize';

/**
 * Tests for CMS section content XSS attack vectors
 * These simulate the actual data flow in SectionRenderer.astro
 */
describe('CMS Section Content XSS Prevention', () => {
  // ─── hero section: ctaUrl ─────────────────────────────────────────

  describe('hero section ctaUrl', () => {
    it('allows valid https CTA URL', () => {
      const content = { ctaUrl: 'https://example.com/signup', ctaText: 'Sign Up' };
      expect(safeUrl(content.ctaUrl)).toBe('https://example.com/signup');
    });

    it('allows relative CTA URL', () => {
      const content = { ctaUrl: '/fr/contact', ctaText: 'Contact' };
      expect(safeUrl(content.ctaUrl)).toBe('/fr/contact');
    });

    it('blocks javascript: in ctaUrl', () => {
      const content = { ctaUrl: 'javascript:alert(document.cookie)', ctaText: 'Click' };
      expect(safeUrl(content.ctaUrl)).toBe('');
    });

    it('blocks data: in ctaUrl', () => {
      const content = { ctaUrl: 'data:text/html,<script>alert(1)</script>', ctaText: 'X' };
      expect(safeUrl(content.ctaUrl)).toBe('');
    });

    it('blocks JavaScript with mixed case', () => {
      expect(safeUrl('JaVaScRiPt:alert(1)')).toBe('');
    });

    it('blocks javascript with leading whitespace', () => {
      expect(safeUrl('  javascript:alert(1)')).toBe('');
    });
  });

  // ─── cta section: buttonUrl ───────────────────────────────────────

  describe('cta section buttonUrl', () => {
    it('allows valid button URL', () => {
      const content = { buttonUrl: 'https://app.example.com', buttonText: 'Go' };
      expect(safeUrl(content.buttonUrl)).toBe('https://app.example.com');
    });

    it('blocks vbscript: in buttonUrl', () => {
      const content = { buttonUrl: 'vbscript:MsgBox("xss")', buttonText: 'Go' };
      expect(safeUrl(content.buttonUrl)).toBe('');
    });
  });

  // ─── map section: embedUrl ────────────────────────────────────────

  describe('map section embedUrl', () => {
    it('allows Google Maps embed', () => {
      const url = 'https://www.google.com/maps/embed?pb=!1m18!';
      expect(safeEmbedUrl(url)).toBe(url);
    });

    it('blocks javascript: in embed URL', () => {
      expect(safeEmbedUrl('javascript:alert(1)')).toBe('');
    });

    it('blocks data: in embed URL', () => {
      expect(safeEmbedUrl('data:text/html,<h1>evil</h1>')).toBe('');
    });

    it('blocks http (insecure) embed URL', () => {
      expect(safeEmbedUrl('http://maps.google.com/embed')).toBe('');
    });

    it('blocks relative path in embed URL', () => {
      expect(safeEmbedUrl('/evil/page')).toBe('');
    });
  });

  // ─── video section: embedUrl ──────────────────────────────────────

  describe('video section embedUrl', () => {
    it('allows YouTube embed', () => {
      const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
      expect(safeEmbedUrl(url)).toBe(url);
    });

    it('allows Vimeo embed', () => {
      const url = 'https://player.vimeo.com/video/123456';
      expect(safeEmbedUrl(url)).toBe(url);
    });

    it('blocks file:// protocol', () => {
      expect(safeEmbedUrl('file:///etc/passwd')).toBe('');
    });
  });

  // ─── contact section: email/phone ─────────────────────────────────

  describe('contact section mailto/tel rendering', () => {
    it('safeUrl allows mailto: links', () => {
      expect(safeUrl('mailto:contact@example.com')).toBe('mailto:contact@example.com');
    });

    it('safeUrl allows tel: links', () => {
      expect(safeUrl('tel://+33123456789')).toBe('tel://+33123456789');
    });
  });
});
