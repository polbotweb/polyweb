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

  it('échappement unique : les entités saisies restent du texte littéral (jamais décodées)', () => {
    expect(renderMarkdown('&amp;lt;')).toBe('<p>&amp;amp;lt;</p>');
    expect(renderMarkdown('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<p>&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;</p>');
    expect(renderMarkdown('a & b < c > d "e" \'f\'')).toBe('<p>a &amp; b &lt; c &gt; d "e" \'f\'</p>'); // guillemets de texte : sans danger hors attribut
    expect(renderMarkdown('&#60;b&#62; &#x3c;i&#x3e;')).not.toMatch(/<b>|<i>/);
    expect(renderMarkdown('&#60;b&#62;')).toBe('<p>&amp;#60;b&amp;#62;</p>');
  });

  it('liens et entités : URL validée sur la valeur brute, échappée une seule fois', () => {
    expect(renderMarkdown('[x](https://e.com/?a=1&amp;b=2)')).toContain('href="https://e.com/?a=1&amp;amp;b=2"');
    expect(renderMarkdown('[x](https://e.com/?a=1&b=2)')).toContain('href="https://e.com/?a=1&amp;b=2"');
    // Guillemets dans l'URL : restent DANS la valeur de href (pas d'attribut injecté).
    expect(renderMarkdown('[x](https://e.com/"onmouseover="alert(1))')).toBe('<p><a href="https://e.com/&quot;onmouseover=&quot;alert(1" rel="nofollow ugc noopener noreferrer">x</a>)</p>');
    expect(renderMarkdown('[a&amp;b <i>](https://e.com)')).toContain('>a&amp;amp;b &lt;i&gt;</a>');
    expect(renderMarkdown('https://e.com/p?x=1&amp;y=2 fin')).toContain('href="https://e.com/p?x=1&amp;amp;y=2"');
    // Schéma masqué par une entité : non reconnu comme sûr → pas de lien.
    expect(renderMarkdown('[x](jav&#97;script:alert(1))')).not.toContain('href=');
    expect(renderMarkdown('[x](&#106;avascript:alert(1))')).not.toContain('href=');
  });

  it('code : contenu échappé une seule fois, entités littérales', () => {
    expect(renderMarkdown('`&amp; <b>`')).toBe('<p><code>&amp;amp; &lt;b&gt;</code></p>');
    expect(renderMarkdown('```\n&lt;x&gt; & <y>\n```')).toBe('<pre><code>&amp;lt;x&amp;gt; &amp; &lt;y&gt;</code></pre>');
  });

  it('citations et listes : texte brut échappé', () => {
    expect(renderMarkdown('> a & <b>')).toBe('<blockquote><p>a &amp; &lt;b&gt;</p></blockquote>');
    expect(renderMarkdown('- x &amp; y')).toBe('<ul><li>x &amp;amp; y</li></ul>');
  });
});
