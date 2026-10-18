// Legal pages seed — inserts into the "pages" table.
// Template "legal" triggers the tabbed FAQ layout on the frontend.
// To update legal content: Admin → Pages → edit the legal page for each locale.

export default [
  {
    id: '00000000-0000-4000-a000-legal00000fr',
    locale: 'fr',
    slug: 'mentions-legales',
    title: 'Mentions Légales',
    metaTitle: 'Mentions Légales – {{siteName}}',
    metaDescription: 'Mentions légales, politique de confidentialité et conditions générales de vente de {{siteName}}.',
    template: 'legal',
    isPublished: true,
    publishedAt: new Date('2025-01-01'),
    sortOrder: 90,
  },
  {
    id: '00000000-0000-4000-a000-legal00000en',
    locale: 'en',
    slug: 'legal-notice',
    title: 'Legal Notice',
    metaTitle: 'Legal Notice – {{siteName}}',
    metaDescription: 'Legal notice, privacy policy and terms of sale for {{siteName}}.',
    template: 'legal',
    isPublished: true,
    publishedAt: new Date('2025-01-01'),
    sortOrder: 90,
  },
  {
    id: '00000000-0000-4000-a000-legal00000es',
    locale: 'es',
    slug: 'aviso-legal',
    title: 'Aviso Legal',
    metaTitle: 'Aviso Legal – {{siteName}}',
    metaDescription: 'Aviso legal, política de privacidad y condiciones generales de venta de {{siteName}}.',
    template: 'legal',
    isPublished: true,
    publishedAt: new Date('2025-01-01'),
    sortOrder: 90,
  },
  {
    id: '00000000-0000-4000-a000-legal00000ar',
    locale: 'ar',
    slug: '\u0627\u0644\u0634\u0631\u0648\u0637-\u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a\u0629',
    title: '\u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a\u0629',
    metaTitle: '\u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a\u0629 \u2013 {{siteName}}',
    metaDescription: '\u0627\u0644\u0625\u0634\u0639\u0627\u0631 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a \u0648\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629 \u0648\u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0639\u0627\u0645\u0629 \u0644\u0644\u0628\u064a\u0639 \u0644{{siteName}}.',
    template: 'legal',
    isPublished: true,
    publishedAt: new Date('2025-01-01'),
    sortOrder: 90,
  },
];
