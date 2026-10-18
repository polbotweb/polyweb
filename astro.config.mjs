import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import Icon from "astro-icon";
import sitemap from '@astrojs/sitemap';

import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

// Double adapter (repris de concordia) : Node standalone par défaut (Docker,
// VPS, Caddy), Vercel si ASTRO_ADAPTER=vercel ou `astro build --vercel`.
const useVercel = process.env.ASTRO_ADAPTER === 'vercel' || process.argv.includes('--vercel');
const adapter = useVercel ? vercel() : node({ mode: 'standalone' });

// https://astro.build/config
export default defineConfig({
  output: 'server',
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      noDiscovery: true,
    },
  },

  site: (() => {
    const url = process.env.SITE_URL;
    if (!url) {
      // Warn but don't crash — hard-fail only when building for deployment (CI sets SITE_URL).
      // Vite statically replaces process.env.NODE_ENV, so we can't gate on it here.
      console.warn('[ASTRO] SITE_URL is not set — using http://localhost:4321 fallback. Set SITE_URL for production builds.');
      return 'http://localhost:4321';
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      return parsed.origin;
    } catch {
      throw new Error(`[ASTRO] SITE_URL is invalid: "${url}". Must be a valid http(s) URL.`);
    }
  })(),

  i18n: {
    locales: ['fr', 'en', 'es', 'ar'],
    defaultLocale: 'fr',
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: true,
    },
  },

  integrations: [
    Icon(),
    sitemap({
      // SSR mode: no pages are prerendered, so auto-discovery finds nothing.
      // All public URLs live in /sitemap-cms.xml (runtime endpoint).
      // customSitemaps adds it to the generated sitemap-index.xml.
      customSitemaps: [
        `${process.env.SITE_URL || 'http://localhost:4321'}/sitemap-cms.xml`,
      ],
      i18n: {
        defaultLocale: 'fr',
        locales: {
          fr: 'fr-FR',
          en: 'en-US',
          es: 'es-ES',
          ar: 'ar',
        },
      },
    }),
  ],

  adapter,

  // CSRF: Astro's checkOrigin is replaced by an identical check in
  // src/middleware.ts (src/lib/security/origin-check.ts) which additionally
  // exempts bearer-token calls to /api/v1/* (not forgeable cross-site).
  security: {
    checkOrigin: false,
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' https://api.iconify.design",
        "frame-src https://www.google.com https://www.youtube.com https://player.vimeo.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        'upgrade-insecure-requests',
      ],
    },
  },

  // Astro manages CSP hashes for bundled scripts/styles.
  // Additional security headers are set in src/middleware.ts.
});