import { describe, it, expect } from 'vitest';
import { validateSectionContent, SECTION_SCHEMAS, SECTION_TYPES } from '@/lib/section-schemas';

describe('SECTION_SCHEMAS registry', () => {
  it('defines all 12 section types', () => {
    expect(SECTION_TYPES).toHaveLength(12);
    const expected = [
      'hero', 'text', 'image', 'gallery', 'cta', 'features',
      'testimonials', 'faq', 'contact', 'map', 'video', 'custom',
    ];
    for (const t of expected) {
      expect(SECTION_SCHEMAS).toHaveProperty(t);
    }
  });

  it('SECTION_TYPES matches SECTION_SCHEMAS keys', () => {
    expect(SECTION_TYPES.sort()).toEqual(Object.keys(SECTION_SCHEMAS).sort());
  });

  it('all items-type fields with arrays have maxItems defined', () => {
    for (const [type, fields] of Object.entries(SECTION_SCHEMAS)) {
      for (const field of fields) {
        if (field.type === 'items') {
          expect(field.maxItems, `${type}.${field.key} should have maxItems`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('validateSectionContent', () => {
  // ── Unknown types pass through (forward-compat) ───────────────────
  it('returns no errors for unknown section types', () => {
    expect(validateSectionContent('future-widget', { anything: 'goes' })).toEqual([]);
  });

  // ── Hero ──────────────────────────────────────────────────────────
  describe('hero', () => {
    it('accepts a valid hero', () => {
      const errors = validateSectionContent('hero', {
        title: 'Welcome',
        subtitle: 'Hello world',
        ctaText: 'Click',
        ctaUrl: 'https://example.com',
        image: '/img/hero.webp',
        imageAlt: 'Hero image',
        imageWidth: 1200,
        imageHeight: 630,
      });
      expect(errors).toEqual([]);
    });

    it('accepts hero with no optional fields', () => {
      expect(validateSectionContent('hero', {})).toEqual([]);
    });

    it('rejects non-string title', () => {
      const errors = validateSectionContent('hero', { title: 123 });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('chaîne');
    });

    it('rejects invalid ctaUrl', () => {
      const errors = validateSectionContent('hero', { ctaUrl: 'javascript:alert(1)' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('URL valide');
    });

    it('rejects title exceeding maxLength', () => {
      const errors = validateSectionContent('hero', { title: 'x'.repeat(201) });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('200');
    });

    it('rejects non-number imageWidth', () => {
      const errors = validateSectionContent('hero', { imageWidth: 'wide' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('nombre');
    });
  });

  // ── Text ──────────────────────────────────────────────────────────
  describe('text', () => {
    it('accepts valid html content', () => {
      expect(validateSectionContent('text', { html: '<p>Hello</p>' })).toEqual([]);
    });

    it('requires html field', () => {
      const errors = validateSectionContent('text', {});
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('requis');
    });

    it('rejects empty html', () => {
      const errors = validateSectionContent('text', { html: '' });
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ── Image ─────────────────────────────────────────────────────────
  describe('image', () => {
    it('accepts valid image', () => {
      expect(validateSectionContent('image', { src: '/img/photo.jpg', alt: 'Photo' })).toEqual([]);
    });

    it('requires src and alt', () => {
      const errors = validateSectionContent('image', {});
      expect(errors.length).toBe(2); // src + alt
    });

    it('rejects invalid src URL', () => {
      const errors = validateSectionContent('image', { src: 'data:image/png;base64,...', alt: 'x' });
      expect(errors.some(e => e.includes('URL valide'))).toBe(true);
    });
  });

  // ── Gallery ───────────────────────────────────────────────────────
  describe('gallery', () => {
    it('accepts valid gallery', () => {
      const errors = validateSectionContent('gallery', {
        images: [
          { src: 'https://example.com/1.jpg', alt: 'One' },
          { src: '/img/2.jpg' },
        ],
      });
      expect(errors).toEqual([]);
    });

    it('requires images array', () => {
      const errors = validateSectionContent('gallery', {});
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('requis');
    });

    it('rejects non-array images', () => {
      const errors = validateSectionContent('gallery', { images: 'not-an-array' });
      expect(errors.some(e => e.includes('tableau'))).toBe(true);
    });

    it('validates items inside images array', () => {
      const errors = validateSectionContent('gallery', {
        images: [{ src: 'javascript:alert(1)' }],
      });
      expect(errors.some(e => e.includes('URL valide'))).toBe(true);
    });

    it('rejects non-object array elements', () => {
      const errors = validateSectionContent('gallery', { images: ['string-item'] });
      expect(errors.some(e => e.includes('objet'))).toBe(true);
    });

    it('rejects gallery exceeding maxItems (100)', () => {
      const images = Array.from({ length: 101 }, (_, i) => ({ src: `https://example.com/${i}.jpg`, alt: `img ${i}` }));
      const errors = validateSectionContent('gallery', { images });
      expect(errors.some(e => e.includes('100'))).toBe(true);
    });
  });

  // ── CTA ───────────────────────────────────────────────────────────
  describe('cta', () => {
    it('accepts valid cta', () => {
      expect(validateSectionContent('cta', {
        buttonText: 'Click me',
        buttonUrl: 'https://example.com',
      })).toEqual([]);
    });

    it('requires buttonText and buttonUrl', () => {
      const errors = validateSectionContent('cta', {});
      expect(errors.length).toBe(2);
    });
  });

  // ── Features ──────────────────────────────────────────────────────
  describe('features', () => {
    it('accepts valid features', () => {
      const errors = validateSectionContent('features', {
        title: 'Our Features',
        items: [
          { title: 'Fast', description: 'Very fast', icon: '⚡' },
          { title: 'Secure', description: 'Very secure' },
        ],
      });
      expect(errors).toEqual([]);
    });

    it('requires items array', () => {
      const errors = validateSectionContent('features', {});
      expect(errors.some(e => e.includes('requis'))).toBe(true);
    });

    it('validates nested item fields', () => {
      const errors = validateSectionContent('features', {
        items: [{ title: 'OK' }], // missing required description
      });
      expect(errors.some(e => e.includes('Description'))).toBe(true);
    });

    it('rejects features exceeding maxItems (50)', () => {
      const items = Array.from({ length: 51 }, (_, i) => ({ title: `F${i}`, description: `Desc ${i}` }));
      const errors = validateSectionContent('features', { items });
      expect(errors.some(e => e.includes('50'))).toBe(true);
    });
  });

  // ── Testimonials ──────────────────────────────────────────────────
  describe('testimonials', () => {
    it('accepts valid testimonials', () => {
      expect(validateSectionContent('testimonials', {
        items: [{ quote: 'Amazing!', author: 'Alice', role: 'CEO' }],
      })).toEqual([]);
    });

    it('requires quote and author in items', () => {
      const errors = validateSectionContent('testimonials', {
        items: [{ role: 'CEO' }], // missing quote + author
      });
      expect(errors.length).toBe(2);
    });

    it('rejects testimonials exceeding maxItems (50)', () => {
      const items = Array.from({ length: 51 }, (_, i) => ({ quote: `Q${i}`, author: `A${i}` }));
      const errors = validateSectionContent('testimonials', { items });
      expect(errors.some(e => e.includes('50'))).toBe(true);
    });
  });

  // ── FAQ ────────────────────────────────────────────────────────────
  describe('faq', () => {
    it('accepts valid faq', () => {
      expect(validateSectionContent('faq', {
        items: [{ question: 'Why?', answer: 'Because.' }],
      })).toEqual([]);
    });

    it('requires question and answer', () => {
      const errors = validateSectionContent('faq', { items: [{}] });
      expect(errors.length).toBe(2);
    });

    it('rejects FAQ exceeding maxItems (100)', () => {
      const items = Array.from({ length: 101 }, (_, i) => ({ question: `Q${i}?`, answer: `A${i}` }));
      const errors = validateSectionContent('faq', { items });
      expect(errors.some(e => e.includes('100'))).toBe(true);
    });
  });

  // ── Contact ───────────────────────────────────────────────────────
  describe('contact', () => {
    it('accepts valid contact', () => {
      expect(validateSectionContent('contact', {
        title: 'Contact Us',
        email: 'hello@example.com',
        phone: '+33 1 23 45 67 89',
      })).toEqual([]);
    });

    it('accepts empty contact (all optional)', () => {
      expect(validateSectionContent('contact', {})).toEqual([]);
    });

    it('rejects invalid email format', () => {
      const errors = validateSectionContent('contact', { email: 'not-an-email' });
      expect(errors.some(e => e.includes('e-mail valide'))).toBe(true);
    });

    it('accepts phone in any string format', () => {
      expect(validateSectionContent('contact', { phone: '+33 1 23 45 67 89' })).toEqual([]);
      expect(validateSectionContent('contact', { phone: '0123456789' })).toEqual([]);
    });

    it('rejects email exceeding maxLength', () => {
      const errors = validateSectionContent('contact', { email: 'a'.repeat(251) + '@b.c' });
      expect(errors.some(e => e.includes('254'))).toBe(true);
    });
  });

  // ── Map ────────────────────────────────────────────────────────────
  describe('map', () => {
    it('accepts valid embed URL', () => {
      expect(validateSectionContent('map', {
        embedUrl: 'https://www.google.com/maps/embed?pb=!1m18',
      })).toEqual([]);
    });

    it('requires embedUrl', () => {
      const errors = validateSectionContent('map', {});
      expect(errors.some(e => e.includes('requis'))).toBe(true);
    });

    it('rejects non-https embed URL', () => {
      const errors = validateSectionContent('map', { embedUrl: 'http://maps.google.com' });
      expect(errors.some(e => e.includes('HTTPS'))).toBe(true);
    });
  });

  // ── Video ──────────────────────────────────────────────────────────
  describe('video', () => {
    it('accepts valid embed URL', () => {
      expect(validateSectionContent('video', {
        embedUrl: 'https://www.youtube.com/embed/abc123',
        caption: 'My video',
      })).toEqual([]);
    });

    it('requires embedUrl', () => {
      const errors = validateSectionContent('video', {});
      expect(errors.some(e => e.includes('requis'))).toBe(true);
    });

    it('rejects javascript: in embedUrl', () => {
      const errors = validateSectionContent('video', { embedUrl: 'javascript:alert(1)' });
      expect(errors.some(e => e.includes('HTTPS'))).toBe(true);
    });
  });

  // ── Custom ─────────────────────────────────────────────────────────
  describe('custom', () => {
    it('accepts valid html', () => {
      expect(validateSectionContent('custom', { html: '<div>Custom</div>' })).toEqual([]);
    });

    it('requires html', () => {
      const errors = validateSectionContent('custom', {});
      expect(errors.some(e => e.includes('requis'))).toBe(true);
    });

    it('rejects html exceeding maxLength', () => {
      const errors = validateSectionContent('custom', { html: 'x'.repeat(100_001) });
      expect(errors.some(e => e.includes('100000'))).toBe(true);
    });
  });
});
