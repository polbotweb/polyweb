import type { CommonTranslations } from '../config';

export default {
  meta: {
    title: 'Starwind Pro — Accélérez votre développement',
    description: 'Construisez des applications prêtes pour la production en deux fois moins de temps.',
  },
  pageRoutes: {
    about: 'a-propos',
    contact: 'contact',
    legal: 'mentions-legales',
  },
  nav: {
    features: 'Fonctionnalités',
    analytics: 'Analytique',
    integrations: 'Intégrations',
    team: 'Équipe',
    about: 'À propos',
    contact: 'Contact',
  },
  cta: {
    getStarted: 'Commencer',
    signIn: 'Se connecter',
  },
  footer: {
    socialHeading: 'Nos Réseaux Sociaux',
    navPrimary: 'Navigation Principale',
    navSecondary: 'Navigation Secondaire',
    legalHeading: 'Mentions Légales',
    copyright: '© 2026 — Tous droits réservés',
    home: 'Accueil',
    aboutLink: 'À propos',
    contact: 'Contact',
    legalNotice: 'Mentions légales',
    privacyPolicy: 'Politique de confidentialité',
    termsOfSale: 'Conditions générales de vente',
  },
  a11y: {
    openMenu: 'Ouvrir le menu',
    switchLanguage: 'Changer de langue',
    skipToContent: 'Aller au contenu principal',
  },
  errors: {
    notFound: {
      title: 'Page introuvable',
      heading: 'Page introuvable',
      message: 'La page que vous cherchez n\u2019existe pas ou a \u00e9t\u00e9 d\u00e9plac\u00e9e.',
      back: 'Retour \u00e0 l\u2019accueil',
    },
    serverError: {
      title: 'Erreur serveur',
      heading: 'Erreur interne du serveur',
      message: 'Quelque chose s\u2019est mal pass\u00e9. Veuillez r\u00e9essayer plus tard.',
      back: 'Retour \u00e0 l\u2019accueil',
    },
  },
  rss: {
    title: 'Starwind Pro \u2014 Flux RSS',
    description: 'Derniers contenus publi\u00e9s sur Starwind Pro',
  },
} satisfies CommonTranslations;
