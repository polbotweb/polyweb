import type { CommonTranslations } from '../config';

export default {
  meta: {
    title: 'Starwind Pro — Acelera tu desarrollo',
    description: 'Construye aplicaciones listas para producción en la mitad del tiempo.',
  },
  pageRoutes: {
    about: 'acerca-de',
    contact: 'contacto',
    legal: 'aviso-legal',
  },
  nav: {
    features: 'Funcionalidades',
    analytics: 'Analítica',
    integrations: 'Integraciones',
    team: 'Equipo',
    about: 'Acerca de',
    contact: 'Contacto',
  },
  cta: {
    getStarted: 'Empezar',
    signIn: 'Iniciar sesión',
  },
  footer: {
    socialHeading: 'Redes Sociales',
    navPrimary: 'Navegación Principal',
    navSecondary: 'Navegación Secundaria',
    legalHeading: 'Legal',
    copyright: '© 2026 — Todos los derechos reservados',
    home: 'Inicio',
    aboutLink: 'Acerca de',
    contact: 'Contacto',
    legalNotice: 'Aviso legal',
    privacyPolicy: 'Política de privacidad',
    termsOfSale: 'Condiciones generales de venta',
  },
  a11y: {
    openMenu: 'Abrir menú',
    switchLanguage: 'Cambiar idioma',
    skipToContent: 'Ir al contenido principal',
  },
  errors: {
    notFound: {
      title: 'P\u00e1gina no encontrada',
      heading: 'P\u00e1gina no encontrada',
      message: 'La p\u00e1gina que busca no existe o ha sido movida.',
      back: 'Volver al inicio',
    },
    serverError: {
      title: 'Error del servidor',
      heading: 'Error interno del servidor',
      message: 'Algo sali\u00f3 mal. Por favor, int\u00e9ntelo de nuevo m\u00e1s tarde.',
      back: 'Volver al inicio',
    },
  },
  rss: {
    title: 'Starwind Pro \u2014 Fuente RSS',
    description: '\u00daltimos contenidos publicados en Starwind Pro',
  },
} satisfies CommonTranslations;
