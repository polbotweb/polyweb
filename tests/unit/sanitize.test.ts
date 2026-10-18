import { describe, it, expect } from 'vitest';
import { sanitizeHtml, safeUrl, safeEmbedUrl } from '@lib/sanitize';

describe('sanitizeHtml', () => {
  it('removes <script> tags', () => {
    expect(sanitizeHtml('<p>Hello</p><script>alert("xss")</script>')).toBe('<p>Hello</p>');
  });

  it('removes onerror handlers from img tags', () => {
    const input = '<img src="x" onerror="alert(1)">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onerror');
    expect(result).toContain('<img');
  });

  it('removes javascript: href from links', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('removes onmouseover handler', () => {
    const result = sanitizeHtml('<div onmouseover="alert(1)">test</div>');
    expect(result).not.toContain('onmouseover');
    expect(result).toContain('<div>test</div>');
  });

  it('preserves legitimate HTML content', () => {
    const input = '<h1>Title</h1><p>Text with <strong>bold</strong> and <em>italic</em></p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('preserves controlled ids only on headings', () => {
    const result = sanitizeHtml(
      '<h2 id="getting-started">Title</h2><p id="not-controlled">Text</p><h3 id="bad id">Bad</h3>',
    );
    expect(result).toContain('<h2 id="getting-started">Title</h2>');
    expect(result).toContain('<p>Text</p>');
    expect(result).toContain('<h3>Bad</h3>');
  });

  it('preserves only the controlled internal-link data attribute on anchors', () => {
    const result = sanitizeHtml(
      '<a href="/post" data-internal-link="post-1" data-other="unsafe">Post</a>' +
      '<span data-internal-link="post-2">Text</span>',
    );
    expect(result).toContain('data-internal-link="post-1"');
    expect(result).not.toContain('data-other');
    expect(result).toContain('<span>Text</span>');
  });

  it('preserves links with valid href and forces rel="noopener noreferrer" on target=_blank', () => {
    const input = '<a href="https://example.com" target="_blank" rel="noopener">Link</a>';
    // The sanitizer hardens target="_blank" links against reverse-tabnabbing by
    // always adding rel="noopener noreferrer" (see sanitize.ts afterSanitizeAttributes hook).
    expect(sanitizeHtml(input)).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">Link</a>');
  });

  it('does not add rel to links without target=_blank', () => {
    const input = '<a href="https://example.com">Link</a>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('preserves tables', () => {
    const input = '<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('preserves images with safe attributes', () => {
    const input = '<img src="/uploads/photo.jpg" alt="Photo" width="400" loading="lazy">';
    const result = sanitizeHtml(input);
    expect(result).toContain('src="/uploads/photo.jpg"');
    expect(result).toContain('alt="Photo"');
  });

  it('removes iframe tags', () => {
    const result = sanitizeHtml('<iframe src="https://evil.com"></iframe>');
    expect(result).not.toContain('iframe');
  });

  it('removes style attributes (not in whitelist)', () => {
    const result = sanitizeHtml('<p style="color:red">text</p>');
    expect(result).not.toContain('style');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml(42)).toBe('');
  });

  it('throws when input exceeds MAX_SANITIZE_LENGTH (500KB)', () => {
    const hugeInput = '<p>' + 'x'.repeat(500_001) + '</p>';
    expect(() => sanitizeHtml(hugeInput)).toThrow(/trop volumineux/);
  });

  it('allows input just under MAX_SANITIZE_LENGTH', () => {
    const input = 'x'.repeat(499_999);
    const result = sanitizeHtml(input);
    expect(result).toBe(input);
  });

  // ─── Deeper XSS vectors ─────────────────────────────────────────

  it('removes nested script inside allowed tag', () => {
    const input = '<div><p><script>document.cookie</script></p></div>';
    const result = sanitizeHtml(input);
    expect(result).toBe('<div><p></p></div>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('document.cookie');
  });

  it('removes data: URI from img src', () => {
    const input = '<img src="data:text/html,<script>alert(1)</script>">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('data:text/html');
  });

  it('removes SVG with onload inside img', () => {
    const input = '<img src="x" onload="alert(1)" onerror="alert(2)">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onload');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert');
  });

  it('removes event handlers from all tags', () => {
    const handlers = ['onclick', 'onfocus', 'onblur', 'onsubmit', 'onkeydown'];
    for (const handler of handlers) {
      const input = `<div ${handler}="alert(1)">test</div>`;
      const result = sanitizeHtml(input);
      expect(result).not.toContain(handler);
    }
  });

  it('removes form tags', () => {
    const input = '<form action="https://evil.com"><input type="text"><button>Submit</button></form>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<form');
    expect(result).not.toContain('action=');
  });

  it('removes object/embed/applet tags', () => {
    for (const tag of ['object', 'embed', 'applet']) {
      const input = `<${tag} data="evil.swf"></${tag}>`;
      const result = sanitizeHtml(input);
      expect(result).not.toContain(`<${tag}`);
    }
  });

  it('removes base tag (URL hijacking)', () => {
    const input = '<base href="https://evil.com/">';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<base');
  });

  it('handles deeply nested malicious content', () => {
    const input = '<div><p><span><a href="javascript:void(0)">click</a></span></p></div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
    expect(result).toContain('<div>');
    expect(result).toContain('<span>');
  });
});

// ─── safeUrl ───────────────────────────────────────────────────────

describe('safeUrl', () => {
  it('allows https URLs', () => {
    expect(safeUrl('https://example.com/page')).toBe('https://example.com/page');
  });

  it('allows http URLs', () => {
    expect(safeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows relative paths starting with /', () => {
    expect(safeUrl('/about')).toBe('/about');
    expect(safeUrl('/fr/contact')).toBe('/fr/contact');
  });

  it('allows mailto: links', () => {
    expect(safeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('allows tel: protocol (no double slashes)', () => {
    expect(safeUrl('tel:+33123456789')).toBe('tel:+33123456789');
    expect(safeUrl('tel:0123456789')).toBe('tel:0123456789');
  });

  it('blocks javascript: protocol', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('javascript:void(0)')).toBe('');
    expect(safeUrl('JAVASCRIPT:alert(1)')).toBe('');
  });

  it('blocks data: protocol', () => {
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('blocks vbscript: protocol', () => {
    expect(safeUrl('vbscript:MsgBox("xss")')).toBe('');
  });

  it('returns empty for non-string input', () => {
    expect(safeUrl(null)).toBe('');
    expect(safeUrl(undefined)).toBe('');
    expect(safeUrl(42)).toBe('');
  });

  it('returns empty for empty string', () => {
    expect(safeUrl('')).toBe('');
  });

  it('trims whitespace before checking', () => {
    expect(safeUrl('  https://example.com  ')).toBe('https://example.com');
    expect(safeUrl('  javascript:alert(1)  ')).toBe('');
  });

  it('blocks protocol-relative URLs (//evil.com)', () => {
    expect(safeUrl('//evil.com')).toBe('');
    expect(safeUrl('//evil.com/path')).toBe('');
    expect(safeUrl('//evil.com@attacker.com')).toBe('');
  });
});

// ─── safeEmbedUrl ──────────────────────────────────────────────────

describe('safeEmbedUrl', () => {
  it('allows https URLs', () => {
    expect(safeEmbedUrl('https://www.youtube.com/embed/abc')).toBe('https://www.youtube.com/embed/abc');
    expect(safeEmbedUrl('https://www.google.com/maps/embed?pb=...')).toBe('https://www.google.com/maps/embed?pb=...');
  });

  it('blocks http URLs (insecure embeds)', () => {
    expect(safeEmbedUrl('http://example.com')).toBe('');
  });

  it('blocks javascript: protocol', () => {
    expect(safeEmbedUrl('javascript:alert(1)')).toBe('');
  });

  it('blocks data: protocol', () => {
    expect(safeEmbedUrl('data:text/html,<h1>evil</h1>')).toBe('');
  });

  it('blocks relative paths', () => {
    expect(safeEmbedUrl('/local/page')).toBe('');
  });

  it('returns empty for non-string input', () => {
    expect(safeEmbedUrl(null)).toBe('');
    expect(safeEmbedUrl(undefined)).toBe('');
    expect(safeEmbedUrl(123)).toBe('');
  });

  it('returns empty for empty string', () => {
    expect(safeEmbedUrl('')).toBe('');
  });

  it('trims whitespace before checking', () => {
    expect(safeEmbedUrl('  https://player.vimeo.com/video/123  ')).toBe('https://player.vimeo.com/video/123');
  });
});
