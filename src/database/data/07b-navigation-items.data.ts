// Navigation items seed — one row per item × locale. References menus by id.
export default [
  // ── Header (fr) ──
  { id: "nav-header-fr-services", menuId: "menu-header", locale: "fr", label: "Services", url: "/fr/services", sortOrder: 0, icon: "mdi:calendar-star", parentId: null, isActive: true, openInNewTab: false },
  { id: "nav-header-fr-blog", menuId: "menu-header", locale: "fr", label: "Blog", url: "/fr/blog", sortOrder: 1, icon: "mdi:post-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-header", locale: "fr", label: "À propos", url: "/fr/a-propos", sortOrder: 0, icon: "mdi:information-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-header", locale: "fr", label: "Contact", url: "/fr/contact", sortOrder: 1, icon: "mdi:email-outline", parentId: null, isActive: true, openInNewTab: false },
  // ── Header (en) ──
  { id: "nav-header-en-services", menuId: "menu-header", locale: "en", label: "Services", url: "/en/services", sortOrder: 0, icon: "mdi:calendar-star", parentId: null, isActive: true, openInNewTab: false },
  { id: "nav-header-en-blog", menuId: "menu-header", locale: "en", label: "Blog", url: "/en/blog", sortOrder: 1, icon: "mdi:post-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-header", locale: "en", label: "About", url: "/en/about", sortOrder: 0, icon: "mdi:information-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-header", locale: "en", label: "Contact", url: "/en/contact", sortOrder: 1, icon: "mdi:email-outline", parentId: null, isActive: true, openInNewTab: false },
  // ── Header (es) ──
  { id: "nav-header-es-services", menuId: "menu-header", locale: "es", label: "Servicios", url: "/es/services", sortOrder: 0, icon: "mdi:calendar-star", parentId: null, isActive: true, openInNewTab: false },
  { id: "nav-header-es-blog", menuId: "menu-header", locale: "es", label: "Blog", url: "/es/blog", sortOrder: 1, icon: "mdi:post-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-header", locale: "es", label: "Acerca de", url: "/es/acerca-de", sortOrder: 0, icon: "mdi:information-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-header", locale: "es", label: "Contacto", url: "/es/contacto", sortOrder: 1, icon: "mdi:email-outline", parentId: null, isActive: true, openInNewTab: false },
  // ── Header (ar) ──
  { id: "nav-header-ar-services", menuId: "menu-header", locale: "ar", label: "الخدمات", url: "/ar/services", sortOrder: 0, icon: "mdi:calendar-star", parentId: null, isActive: true, openInNewTab: false },
  { id: "nav-header-ar-blog", menuId: "menu-header", locale: "ar", label: "المدونة", url: "/ar/blog", sortOrder: 1, icon: "mdi:post-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-header", locale: "ar", label: "حول", url: "/ar/من-نحن", sortOrder: 0, icon: "mdi:information-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-header", locale: "ar", label: "اتصل بنا", url: "/ar/اتصل-بنا", sortOrder: 1, icon: "mdi:email-outline", parentId: null, isActive: true, openInNewTab: false },

  // ── Footer primary (fr) ──
  { menuId: "menu-footer-primary", locale: "fr", label: "Accueil", url: "/fr/", sortOrder: 0, icon: "mdi:home-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-primary", locale: "fr", label: "À propos", url: "/fr/a-propos", sortOrder: 1, icon: "mdi:information-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-primary", locale: "fr", label: "Contact", url: "/fr/contact", sortOrder: 2, icon: "mdi:email-outline", parentId: null, isActive: true, openInNewTab: false },
  // ── Footer primary (en) ──
  { menuId: "menu-footer-primary", locale: "en", label: "Home", url: "/en/", sortOrder: 0, icon: "mdi:home-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-primary", locale: "en", label: "About", url: "/en/about", sortOrder: 1, icon: "mdi:information-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-primary", locale: "en", label: "Contact", url: "/en/contact", sortOrder: 2, icon: "mdi:email-outline", parentId: null, isActive: true, openInNewTab: false },
  // ── Footer primary (es) ──
  { menuId: "menu-footer-primary", locale: "es", label: "Inicio", url: "/es/", sortOrder: 0, icon: "mdi:home-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-primary", locale: "es", label: "Acerca de", url: "/es/acerca-de", sortOrder: 1, icon: "mdi:information-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-primary", locale: "es", label: "Contacto", url: "/es/contacto", sortOrder: 2, icon: "mdi:email-outline", parentId: null, isActive: true, openInNewTab: false },
  // ── Footer primary (ar) ──
  { menuId: "menu-footer-primary", locale: "ar", label: "الرئيسية", url: "/ar/", sortOrder: 0, icon: "mdi:home-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-primary", locale: "ar", label: "حول", url: "/ar/من-نحن", sortOrder: 1, icon: "mdi:information-outline", parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-primary", locale: "ar", label: "اتصل بنا", url: "/ar/اتصل-بنا", sortOrder: 2, icon: "mdi:email-outline", parentId: null, isActive: true, openInNewTab: false },

  // ── Footer secondary (fr) ──
  { menuId: "menu-footer-secondary", locale: "fr", label: "Tarifs", url: "#pricing", sortOrder: 0, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-secondary", locale: "fr", label: "Blog", url: "#blog", sortOrder: 1, icon: null, parentId: null, isActive: true, openInNewTab: false },
  // ── Footer secondary (en) ──
  { menuId: "menu-footer-secondary", locale: "en", label: "Pricing", url: "#pricing", sortOrder: 0, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-secondary", locale: "en", label: "Blog", url: "#blog", sortOrder: 1, icon: null, parentId: null, isActive: true, openInNewTab: false },
  // ── Footer secondary (es) ──
  { menuId: "menu-footer-secondary", locale: "es", label: "Precios", url: "#pricing", sortOrder: 0, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-secondary", locale: "es", label: "Blog", url: "#blog", sortOrder: 1, icon: null, parentId: null, isActive: true, openInNewTab: false },
  // ── Footer secondary (ar) ──
  { menuId: "menu-footer-secondary", locale: "ar", label: "الأسعار", url: "#pricing", sortOrder: 0, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-secondary", locale: "ar", label: "المدونة", url: "#blog", sortOrder: 1, icon: null, parentId: null, isActive: true, openInNewTab: false },

  // ── Footer legal (fr) ──
  { menuId: "menu-footer-legal", locale: "fr", label: "Mentions légales", url: "/fr/mentions-legales#section-0", sortOrder: 0, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-legal", locale: "fr", label: "Politique de confidentialité", url: "/fr/mentions-legales#section-1", sortOrder: 1, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-legal", locale: "fr", label: "Conditions générales de vente", url: "/fr/mentions-legales#section-2", sortOrder: 2, icon: null, parentId: null, isActive: true, openInNewTab: false },
  // ── Footer legal (en) ──
  { menuId: "menu-footer-legal", locale: "en", label: "Legal Notice", url: "/en/legal-notice#section-0", sortOrder: 0, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-legal", locale: "en", label: "Privacy Policy", url: "/en/legal-notice#section-1", sortOrder: 1, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-legal", locale: "en", label: "Terms of Sale", url: "/en/legal-notice#section-2", sortOrder: 2, icon: null, parentId: null, isActive: true, openInNewTab: false },
  // ── Footer legal (es) ──
  { menuId: "menu-footer-legal", locale: "es", label: "Aviso legal", url: "/es/aviso-legal#section-0", sortOrder: 0, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-legal", locale: "es", label: "Política de privacidad", url: "/es/aviso-legal#section-1", sortOrder: 1, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-legal", locale: "es", label: "Condiciones generales de venta", url: "/es/aviso-legal#section-2", sortOrder: 2, icon: null, parentId: null, isActive: true, openInNewTab: false },
  // ── Footer legal (ar) ──
  { menuId: "menu-footer-legal", locale: "ar", label: "إشعار قانوني", url: "/ar/الشروط-القانونية#section-0", sortOrder: 0, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-legal", locale: "ar", label: "سياسة الخصوصية", url: "/ar/الشروط-القانونية#section-1", sortOrder: 1, icon: null, parentId: null, isActive: true, openInNewTab: false },
  { menuId: "menu-footer-legal", locale: "ar", label: "الشروط العامة للبيع", url: "/ar/الشروط-القانونية#section-2", sortOrder: 2, icon: null, parentId: null, isActive: true, openInNewTab: false },
];
