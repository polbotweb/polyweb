import { describe, it, expect } from 'vitest';
import { escapeHtml, extractMentions, renderMarkdown, MARKDOWN_SOURCE_MAX } from '@/core/content/markdown';

describe('core/content/markdown — rendu sûr', () => {
  it('échappe tout HTML brut (aucune balise ni attribut d’événement)', () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> <b>gras</b>');
    expect(html).not.toMatch(/<script|<img|<b>/i);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;');
  });

  it('liens : schémas sûrs uniquement, rel nofollow ugc', () => {
    expect(renderMarkdown('[ok](https://example.com/a?b=1&c=2)')).toContain('<a href="https://example.com/a?b=1&amp;c=2" rel="nofollow ugc noopener noreferrer">ok</a>');
    const evil = renderMarkdown('[x](javascript:alert(1)) [y](data:text/html,hi) [z](vbscript:msgbox)');
    expect(evil).not.toMatch(/href=|javascript:|data:text|vbscript:/i);
    expect(renderMarkdown('voir https://example.org/x_y_z fin')).toContain('href="https://example.org/x_y_z"');
  });

  it('sous-ensemble : titres décalés, listes, citations, code, emphase', () => {
    const html = renderMarkdown('# Titre\n\n- un\n- **deux**\n\n1. a\n2. b\n\n> cité\n\n```\n<b>code</b> *pas*\n```\n\n`x*y*` et *ital* et _aussi_');
    expect(html).toContain('<h3>Titre</h3>');
    expect(html).toContain('<ul><li>un</li><li><strong>deux</strong></li></ul>');
    expect(html).toContain('<ol><li>a</li><li>b</li></ol>');
    expect(html).toContain('<blockquote><p>cité</p></blockquote>');
    expect(html).toContain('<pre><code>&lt;b&gt;code&lt;/b&gt; *pas*</code></pre>');
    expect(html).toContain('<code>x*y*</code>');
    expect(html).toContain('<em>ital</em>');
    expect(html).toContain('<em>aussi</em>');
    expect(html).not.toMatch(/<h1|<h2/);
  });

  it('mentions : balisées dans le rendu, extraites hors code, uniques et bornées', () => {
    expect(renderMarkdown('Bonjour @Alice !')).toContain('<span class="mention">@Alice</span>');
    expect(renderMarkdown('mail a@b.com')).not.toContain('mention');
    expect(extractMentions('@Alice et @alice, `@code` ```\n@bloc\n``` mail x@y.fr @bob_2')).toEqual(['alice', 'bob_2']);
    expect(extractMentions(Array.from({ length: 30 }, (_, i) => `@user${i}`).join(' '))).toHaveLength(10);
  });

  it('marqueurs internes retirés et source bornée', () => {
    expect(renderMarkdown('a\u00010\u0001b\u00000\u0000c')).toBe('<p>a0b0c</p>');
    expect(renderMarkdown('x'.repeat(MARKDOWN_SOURCE_MAX + 500)).length).toBeLessThan(MARKDOWN_SOURCE_MAX + 20);
    expect(escapeHtml(`<"'&>`)).toBe('&lt;&quot;&#39;&amp;&gt;');
  });
});
