/**
 * Lighthouse CI configuration — performance, a11y, best-practices, SEO gates
 * across all 4 locales (fr, en, es, ar) including RTL.
 *
 * Reads session cookies from .a11y-cookies.json (created by tests/a11y/setup.ts).
 */

const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.A11Y_BASE_URL || 'http://localhost:4321';

// Detect Chrome executable — prefer env var, then Playwright's, then system default
function findChrome() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    const { chromium } = require('@playwright/test');
    const exe = chromium.executablePath();
    if (exe && fs.existsSync(exe)) return exe;
  } catch { /* Playwright not installed or no browser */ }
  return undefined;
}

const chromePath = findChrome();
const COOKIES_PATH = path.resolve(__dirname, '.a11y-cookies.json');

let userCookie = '';
let adminCookie = '';
// Boutique (tests/a11y/setup.ts) : cookie panier invité signé, commande en attente + jeton de suivi.
let shopCartCookie = '';
let shopOrder = null;
let shopSlugs = null;
// Commande livrée avec une demande de retour (RMA) : suivi public, fiche commande et retours admin.
let shopReturn = null;
// Logistique : inventaires seedés (un en cours, un validé).
let logistics = null;
if (fs.existsSync(COOKIES_PATH)) {
  const data = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  userCookie = data.userCookie ?? '';
  adminCookie = data.adminCookie ?? '';
  shopCartCookie = data.shopCartCookie ?? '';
  shopOrder = data.shopOrder ?? null;
  shopSlugs = data.shopSlugs ?? null;
  shopReturn = data.shopReturn ?? null;
  logistics = data.logistics ?? null;
}

// ── Route definitions per locale ─────────────────────────────────────

const locales = ['fr', 'en', 'es', 'ar'];

const pageRoutes = {
  about:   { fr: 'a-propos', en: 'about', es: 'acerca-de', ar: 'من-نحن' },
  contact: { fr: 'contact',  en: 'contact', es: 'contacto', ar: 'اتصل-بنا' },
  legal:   { fr: 'mentions-legales', en: 'legal-notice', es: 'aviso-legal', ar: 'الشروط-القانونية' },
};

const authRoutes = {
  'sign-in':         { fr: 'connexion', en: 'sign-in', es: 'iniciar-sesion', ar: 'تسجيل-الدخول' },
  'sign-up':         { fr: 'inscription', en: 'sign-up', es: 'registro', ar: 'انشاء-حساب' },
  'forgot-password': { fr: 'mot-de-passe-oublie', en: 'forgot-password', es: 'contrasena-olvidada', ar: 'نسيت-كلمة-المرور' },
  'dashboard':       { fr: 'tableau-de-bord', en: 'dashboard', es: 'panel', ar: 'لوحة-التحكم' },
  'profile':         { fr: 'profil', en: 'profile', es: 'perfil', ar: 'الملف-الشخصي' },
};

// ── Build URL lists ──────────────────────────────────────────────────

const publicUrls = [];
for (const lang of locales) {
  publicUrls.push(`${BASE}/${lang}/`);
  for (const [, slugs] of Object.entries(pageRoutes)) {
    publicUrls.push(`${BASE}/${lang}/${slugs[lang]}`);
  }
  // Blog listing (route segment "blog" is not localized). Post/category/tag
  // detail pages need seeded demo content, not run before this CI job.
  publicUrls.push(`${BASE}/${lang}/blog`);
  // Public booking flow (route segment "bookings" is not localized). The resource
  // A11YROOM is seeded by tests/a11y/setup.ts (open 24/7, so slots always render).
  publicUrls.push(`${BASE}/${lang}/bookings`);
  publicUrls.push(`${BASE}/${lang}/bookings/A11YROOM`);
  for (const pageId of ['sign-in', 'sign-up', 'forgot-password']) {
    publicUrls.push(`${BASE}/${lang}/auth/${authRoutes[pageId][lang]}`);
  }
  // Fiche du produit seedé par tests/a11y/setup.ts (indexable, seuils standard).
  if (shopSlugs) publicUrls.push(`${BASE}/${lang}/shop/${encodeURIComponent(shopSlugs[lang])}`);
}

// Tunnel boutique (panier, commande, suivi) : pages privées « noindex » à dessein, auditées
// dans un lot à part (cookie panier) par tests/a11y/lhci-authed.cjs, sans « is-crawlable ».
const shopUrls = [];
for (const lang of locales) {
  if (shopCartCookie) shopUrls.push(`${BASE}/${lang}/shop/cart`, `${BASE}/${lang}/shop/checkout`);
  if (shopOrder) shopUrls.push(`${BASE}/${lang}/shop/order/${encodeURIComponent(shopOrder.id)}?t=${encodeURIComponent(shopOrder.token)}`);
  if (shopReturn) shopUrls.push(`${BASE}/${lang}/shop/order/${encodeURIComponent(shopReturn.orderId)}?t=${encodeURIComponent(shopReturn.token)}`);
}

// Lighthouse doesn't support per-URL headers in the config file,
// so authenticated pages are collected in separate runs via CI steps.
// We group all URLs here and use extraHeaders for the authenticated batch.

const authedUrls = [];
for (const lang of locales) {
  for (const pageId of ['dashboard', 'profile']) {
    authedUrls.push(`${BASE}/${lang}/auth/${authRoutes[pageId][lang]}`);
  }
}

const adminUrls = [];
const adminPages = ['stats', 'site', 'navigation', 'theme', 'blog'];
for (const lang of locales) {
  for (const page of adminPages) {
    adminUrls.push(`${BASE}/${lang}/admin/${page}`);
  }
  // Tableau de bord ERP (CA, marges, stock).
  adminUrls.push(`${BASE}/${lang}/admin/dashboard`);
  adminUrls.push(`${BASE}/${lang}/admin/orders`);
  if (shopOrder) adminUrls.push(`${BASE}/${lang}/admin/orders/${encodeURIComponent(shopOrder.id)}`);
  // Retours (RMA) : liste, fiche du retour seedé, fiche de sa commande (section retours).
  adminUrls.push(`${BASE}/${lang}/admin/returns`);
  if (shopReturn) adminUrls.push(`${BASE}/${lang}/admin/returns/${encodeURIComponent(shopReturn.id)}`, `${BASE}/${lang}/admin/orders/${encodeURIComponent(shopReturn.orderId)}`);
  // Logistique : inventaires (liste, en cours, validé) et grand livre de stock.
  adminUrls.push(`${BASE}/${lang}/admin/logistics/inventories`, `${BASE}/${lang}/admin/logistics/movements`);
  if (logistics) adminUrls.push(`${BASE}/${lang}/admin/logistics/inventories/${encodeURIComponent(logistics.openCountId)}`, `${BASE}/${lang}/admin/logistics/inventories/${encodeURIComponent(logistics.validatedCountId)}`);
}

module.exports = {
  ci: {
    collect: {
      url: publicUrls,
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --disable-extensions --disable-component-extensions-with-background-pages',
        preset: 'desktop',
        maxWaitForLoad: 45000,
        ...(chromePath ? { chromePath } : {}),
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
      },
    },
    upload: {
      // Sortie brute locale (ignorée par git, jamais de stockage public) ; seules les copies
      // renommées et caviardées par tests/helpers/lighthouse-report.cjs sont versionnées.
      target: 'filesystem',
      outputDir: '.lighthouseci/filesystem',
    },
  },
  // Exported for use by CI scripts to run separate authenticated batches
  _authedUrls: authedUrls,
  _adminUrls: adminUrls,
  _userCookie: userCookie,
  _adminCookie: adminCookie,
  _shopUrls: shopUrls,
  _shopCartCookie: shopCartCookie,
};
