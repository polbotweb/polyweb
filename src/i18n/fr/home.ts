import type { HomeTranslations } from '../config';
import { houseCivilization, stratesCivilization, stone, polish, bronze, fer } from '../../assets/images/brand';
import { avatar1, avatar2, avatar3 } from '../../assets/images/avatars';

export default {
  hero: {
    badge: 'Bâtir ensemble',
    title: 'La civilisation se construit par strates',
    description:
      'KLAN accompagne les communautés qui bâtissent sur l\'héritage de ceux qui les ont précédées. Chaque génération ajoute sa pierre à l\'édifice commun.',
    ctaPrimary: 'Rejoindre le mouvement',
    ctaSecondary: 'Découvrir notre vision',
    socialProofHeading: 'Rejoignez 10 000+ bâtisseurs',
    socialProofSubtext: 'Construire l\'avenir ensemble',
    carouselImages: [
      { src: houseCivilization, alt: 'Maison ancestrale symbolisant les strates de la civilisation' },
      { src: stratesCivilization, alt: 'Strates géologiques symbolisant l\'accumulation des savoirs' },
    ],
  },
  logos: [
    { name: 'Fondation Atlas', src: stone },
    { name: 'Réseau Héritage', src: polish },
    { name: 'Collectif Racines', src: bronze },
    { name: 'Alliance Bâtisseurs', src: fer },
  ],
  pillars: {
    badge: 'Piliers fondateurs',
    title: 'Les fondations de KLAN',
    description: 'Quatre principes guident notre mission de construction collective.',
    items: [
      { icon: 'mdi:account-group', title: 'Communauté', description: 'Rassembler ceux qui partagent une vision commune et bâtissent ensemble.' },
      { icon: 'mdi:book-open-variant', title: 'Transmission', description: 'Préserver et transmettre les savoirs d\'une génération à l\'autre.' },
      { icon: 'mdi:shield-check', title: 'Intégrité', description: 'Construire sur des fondations solides, avec transparence et authenticité.' },
      { icon: 'mdi:trending-up', title: 'Progression', description: 'Chaque strate s\'appuie sur la précédente pour aller plus haut.' },
    ],
  },
  testimonials: {
    badge: 'Témoignages',
    heading: 'Ils bâtissent avec KLAN',
    description: 'Découvrez comment notre communauté de bâtisseurs construit l\'avenir ensemble.',
    items: [
      {
        name: 'Amina Belkacem',
        role: 'Fondatrice, Collectif Racines',
        content: 'KLAN nous a permis de structurer notre transmission intergénérationnelle. Chaque strate de savoir est préservée et accessible.',
        rating: 5,
        image: avatar1,
      },
      {
        name: 'Youssef Mansouri',
        role: 'Directeur, Institut Mémoire',
        content: 'La vision de KLAN résonne profondément avec notre mission. Bâtir sur les fondations de ceux qui nous ont précédés.',
        rating: 5,
        image: avatar2,
      },
      {
        name: 'Sarah Dupont',
        role: 'Responsable communauté',
        content: 'Un outil indispensable pour fédérer notre communauté. L\'approche par strates donne du sens à chaque contribution.',
        rating: 4,
        image: avatar3,
      },
      {
        name: 'Karim Ouadah',
        role: 'Architecte, Alliance Bâtisseurs',
        content: 'KLAN incarne ce que devrait être toute plateforme communautaire : un édifice collectif où chacun apporte sa pierre.',
        rating: 5,
        image: avatar1,
      },
    ],
  },
  pricing: {
    eyebrow: 'Tarifs',
    heading: 'Choisissez votre plan',
    description: 'Sélectionnez le plan parfait pour vos besoins. Changez à tout moment.',
    monthlyLabel: 'Mensuel',
    yearlyLabel: 'Annuel',
    discountBadge: '-20%',
    plans: [
      {
        name: 'Bâtisseur',
        description: 'Pour ceux qui construisent activement au sein de la communauté.',
        monthlyPrice: '29',
        yearlyPrice: '279',
        features: [
          { text: 'Accès à la communauté', included: true },
          { text: 'Contenus fondamentaux', included: true },
          { text: 'Ateliers de transmission', included: true },
          { text: 'Mentorat communautaire', included: true },
          { text: 'Outils de collaboration', included: true },
        ],
        buttonText: 'Devenir bâtisseur',
        buttonHref: '#',
      },
      {
        name: 'Pilier',
        description: 'Pour les leaders qui portent la vision et guident la communauté.',
        monthlyPrice: '79',
        yearlyPrice: '759',
        features: [
          { text: 'Tout de Bâtisseur', included: true },
          { text: 'Cercle des piliers', included: true },
          { text: 'Événements exclusifs', included: true },
          { text: 'Influence sur la feuille de route', included: true },
          { text: 'Support dédié', included: true },
          { text: 'Accès API complet', included: true },
        ],
        buttonText: 'Rejoindre les piliers',
        buttonHref: '#',
      },
    ],
  },
  ctaBanner: {
    title: 'Prêt à bâtir votre strate ?',
    description: 'Rejoignez des milliers de bâtisseurs qui construisent l\'avenir ensemble avec KLAN.',
    primaryButton: { text: 'Rejoindre KLAN', href: '#' },
    secondaryButton: { text: 'En savoir plus →', href: '#' },
  },
} satisfies HomeTranslations;
