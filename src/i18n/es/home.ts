import type { HomeTranslations } from '../config';
import { houseCivilization, stratesCivilization, stone, polish, bronze, fer } from '../../assets/images/brand';
import { avatar1, avatar2, avatar3 } from '../../assets/images/avatars';

export default {
  hero: {
    badge: 'Construir juntos',
    title: 'La civilización se construye por estratos',
    description:
      'KLAN acompaña a las comunidades que construyen sobre el legado de quienes les precedieron. Cada generación añade su piedra al edificio común.',
    ctaPrimary: 'Unirse al movimiento',
    ctaSecondary: 'Descubrir nuestra visión',
    socialProofHeading: 'Únete a 10.000+ constructores',
    socialProofSubtext: 'Construyendo el futuro juntos',
    carouselImages: [
      { src: houseCivilization, alt: 'Casa ancestral que simboliza los estratos de la civilización' },
      { src: stratesCivilization, alt: 'Estratos geológicos que simbolizan la acumulación de saberes' },
    ],
  },
  logos: [
    { name: 'Fundación Atlas', src: stone },
    { name: 'Red Herencia', src: polish },
    { name: 'Colectivo Raíces', src: bronze },
    { name: 'Alianza Constructores', src: fer },
  ],
  pillars: {
    badge: 'Pilares fundadores',
    title: 'Los cimientos de KLAN',
    description: 'Cuatro principios guían nuestra misión de construcción colectiva.',
    items: [
      { icon: 'mdi:account-group', title: 'Comunidad', description: 'Reunir a quienes comparten una visión común y construyen juntos.' },
      { icon: 'mdi:book-open-variant', title: 'Transmisión', description: 'Preservar y transmitir los saberes de una generación a otra.' },
      { icon: 'mdi:shield-check', title: 'Integridad', description: 'Construir sobre cimientos sólidos, con transparencia y autenticidad.' },
      { icon: 'mdi:trending-up', title: 'Progresión', description: 'Cada estrato se apoya en el anterior para llegar más alto.' },
    ],
  },
  testimonials: {
    badge: 'Testimonios',
    heading: 'Construyen con KLAN',
    description: 'Descubre cómo nuestra comunidad de constructores forja el futuro juntos.',
    items: [
      {
        name: 'Amina Belkacem',
        role: 'Fundadora, Colectivo Raíces',
        content: 'KLAN nos ayudó a estructurar nuestra transmisión intergeneracional. Cada estrato de saber se preserva y es accesible.',
        rating: 5,
        image: avatar1,
      },
      {
        name: 'Youssef Mansouri',
        role: 'Director, Instituto Memoria',
        content: 'La visión de KLAN resuena profundamente con nuestra misión. Construir sobre los cimientos de quienes nos precedieron.',
        rating: 5,
        image: avatar2,
      },
      {
        name: 'Sarah Dupont',
        role: 'Responsable de comunidad',
        content: 'Una herramienta indispensable para unir nuestra comunidad. El enfoque por estratos da sentido a cada contribución.',
        rating: 4,
        image: avatar3,
      },
      {
        name: 'Karim Ouadah',
        role: 'Arquitecto, Alianza Constructores',
        content: 'KLAN encarna lo que toda plataforma comunitaria debería ser: un edificio colectivo donde cada uno aporta su piedra.',
        rating: 5,
        image: avatar1,
      },
    ],
  },
  pricing: {
    eyebrow: 'Precios',
    heading: 'Elige tu plan',
    description: 'Selecciona el plan perfecto para tus necesidades. Cambia en cualquier momento.',
    monthlyLabel: 'Mensual',
    yearlyLabel: 'Anual',
    discountBadge: '-20%',
    plans: [
      {
        name: 'Constructor',
        description: 'Para quienes construyen activamente dentro de la comunidad.',
        monthlyPrice: '29',
        yearlyPrice: '279',
        features: [
          { text: 'Acceso a la comunidad', included: true },
          { text: 'Contenidos fundamentales', included: true },
          { text: 'Talleres de transmisión', included: true },
          { text: 'Mentoría comunitaria', included: true },
          { text: 'Herramientas de colaboración', included: true },
        ],
        buttonText: 'Ser constructor',
        buttonHref: '#',
      },
      {
        name: 'Pilar',
        description: 'Para los líderes que llevan la visión y guían la comunidad.',
        monthlyPrice: '79',
        yearlyPrice: '759',
        features: [
          { text: 'Todo de Constructor', included: true },
          { text: 'Círculo de pilares', included: true },
          { text: 'Eventos exclusivos', included: true },
          { text: 'Influencia en la hoja de ruta', included: true },
          { text: 'Soporte dedicado', included: true },
          { text: 'Acceso API completo', included: true },
        ],
        buttonText: 'Unirse a los pilares',
        buttonHref: '#',
      },
    ],
  },
  ctaBanner: {
    title: '¿Listo para construir tu estrato?',
    description: 'Únete a miles de constructores que forjan el futuro juntos con KLAN.',
    primaryButton: { text: 'Unirse a KLAN', href: '#' },
    secondaryButton: { text: 'Saber más →', href: '#' },
  },
} satisfies HomeTranslations;
