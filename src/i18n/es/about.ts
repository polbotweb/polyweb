import type { AboutTranslations } from '../config';
import { stone, bronze, houseCivilization, polish } from '../../assets/images/brand';
import { avatar1, avatar2, avatar3 } from '../../assets/images/avatars';

export default {
  meta: {
    title: 'Acerca de – KLAN',
    description: 'Descubre la historia, la misión y el equipo detrás de KLAN. Construimos civilización estrato a estrato.',
  },
  hero: {
    eyebrow: 'Nuestra historia',
    title: 'Construir una civilización estrato a estrato',
    description: 'KLAN nació de una convicción: cada generación se construye sobre los cimientos dejados por las que la precedieron. Nuestra misión es estructurar esta transmisión para que cada estrato de saber, cultura y experiencia sea preservado y accesible.',
  },
  mission: {
    eyebrow: 'Nuestra razón de ser',
    title: 'Misión y Visión',
    description: 'Dos pilares guían cada una de nuestras decisiones.',
    cards: [
      {
        icon: 'mdi:target',
        title: 'Nuestra Misión',
        description: 'Acompañar a las comunidades que construyen sobre el legado de quienes las precedieron. Creamos herramientas que permiten la transmisión intergeneracional de saberes, valores y recursos.',
      },
      {
        icon: 'mdi:eye-outline',
        title: 'Nuestra Visión',
        description: 'Un mundo donde cada comunidad pueda construir de forma sostenible, estrato tras estrato, sobre cimientos sólidos. Donde el legado colectivo no se pierda sino que se amplifique.',
      },
    ],
  },
  values: {
    eyebrow: 'Lo que nos define',
    title: 'Nuestros Valores',
    description: 'Los principios fundadores que guían a KLAN cada día.',
    items: [
      {
        title: 'Herencia',
        description: 'Creemos que el pasado es un tesoro. Cada saber, cada experiencia merece ser preservado y transmitido a las generaciones futuras. La herencia no es una carga, es un trampolín.',
        image: stone,
        value: 'heritage',
      },
      {
        title: 'Transmisión',
        description: 'El saber que no se transmite es un saber perdido. Hacemos todo para que los conocimientos circulen libremente entre generaciones y comunidades.',
        image: bronze,
        value: 'transmission',
      },
      {
        title: 'Comunidad',
        description: 'Solo se va rápido, juntos se llega lejos. KLAN sitúa la comunidad en el centro de todo. Es en lo colectivo donde nacen los proyectos más ambiciosos y duraderos.',
        image: houseCivilization,
        value: 'community',
      },
      {
        title: 'Integridad',
        description: 'Construir sobre cimientos sólidos exige transparencia y autenticidad. Nos comprometemos a actuar con honestidad hacia nuestra comunidad, nuestros socios y nosotros mismos.',
        image: polish,
        value: 'integrity',
      },
    ],
  },
  team: {
    eyebrow: 'Los constructores',
    title: 'Nuestro Equipo',
    description: 'Apasionados que trabajan cada día para dar vida a la visión de KLAN.',
    members: [
      {
        name: 'Youssef Mansouri',
        role: 'Fundador y CEO',
        bio: 'Visionario apasionado por la transmisión intergeneracional y la construcción comunitaria.',
        image: avatar2,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'X', icon: 'twitter', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:youssef@klan.com' },
        ],
      },
      {
        name: 'Amina Belkacem',
        role: 'Directora de Operaciones',
        bio: 'Experta en gestión de comunidades y desarrollo organizacional.',
        image: avatar1,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:amina@klan.com' },
        ],
      },
      {
        name: 'Karim Ouadah',
        role: 'Director Técnico',
        bio: 'Arquitecto de software especializado en plataformas comunitarias a gran escala.',
        image: avatar3,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'X', icon: 'twitter', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:karim@klan.com' },
        ],
      },
      {
        name: 'Sarah Dupont',
        role: 'Responsable de Comunidad',
        bio: 'Animadora de comunidades comprometida que teje vínculos entre los miembros de KLAN.',
        image: avatar1,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'X', icon: 'twitter', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:sarah@klan.com' },
        ],
      },
    ],
  },
  cta: {
    title: '¿Listo para unirte a la aventura KLAN?',
    description: 'Conviértete en actor de esta construcción colectiva. Cada piedra cuenta en el edificio común.',
    primaryButton: { text: 'Unirse a KLAN', href: '#' },
    secondaryButton: { text: 'Contactarnos', href: '#' },
  },
} satisfies AboutTranslations;
