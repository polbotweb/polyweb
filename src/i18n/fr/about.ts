import type { AboutTranslations } from '../config';
import { stone, bronze, houseCivilization, polish } from '../../assets/images/brand';
import { avatar1, avatar2, avatar3 } from '../../assets/images/avatars';

export default {
  meta: {
    title: 'À Propos – KLAN',
    description: 'Découvrez l\'histoire, la mission et l\'équipe derrière KLAN. Nous bâtissons ensemble une civilisation par strates.',
  },
  hero: {
    eyebrow: 'Notre histoire',
    title: 'Bâtir une civilisation par strates',
    description: 'KLAN est né d\'une conviction : chaque génération se construit sur les fondations laissées par celles qui l\'ont précédée. Notre mission est de structurer cette transmission pour que chaque strate de savoir, de culture et d\'expérience soit préservée et accessible.',
  },
  mission: {
    eyebrow: 'Notre raison d\'être',
    title: 'Mission & Vision',
    description: 'Deux piliers guident chacune de nos décisions.',
    cards: [
      {
        icon: 'mdi:target',
        title: 'Notre Mission',
        description: 'Accompagner les communautés qui bâtissent sur l\'héritage de ceux qui les ont précédées. Nous créons les outils qui permettent la transmission intergénérationnelle des savoirs, des valeurs et des ressources.',
      },
      {
        icon: 'mdi:eye-outline',
        title: 'Notre Vision',
        description: 'Un monde où chaque communauté peut construire durablement, strate après strate, en s\'appuyant sur des fondations solides. Où l\'héritage collectif n\'est plus perdu mais amplifié.',
      },
    ],
  },
  values: {
    eyebrow: 'Ce qui nous définit',
    title: 'Nos Valeurs',
    description: 'Les principes fondateurs qui guident KLAN au quotidien.',
    items: [
      {
        title: 'Héritage',
        description: 'Nous croyons que le passé est un trésor. Chaque savoir, chaque expérience mérite d\'être préservé et transmis aux générations futures. L\'héritage n\'est pas un poids, c\'est un tremplin.',
        image: stone,
        value: 'heritage',
      },
      {
        title: 'Transmission',
        description: 'Le savoir qui n\'est pas transmis est un savoir perdu. Nous mettons tout en œuvre pour que les connaissances circulent librement entre les générations et les communautés.',
        image: bronze,
        value: 'transmission',
      },
      {
        title: 'Communauté',
        description: 'Seul on va vite, ensemble on va loin. KLAN place la communauté au centre de tout. C\'est dans le collectif que naissent les projets les plus ambitieux et les plus durables.',
        image: houseCivilization,
        value: 'community',
      },
      {
        title: 'Intégrité',
        description: 'Construire sur des fondations solides exige transparence et authenticité. Nous nous engageons à agir avec honnêteté envers notre communauté, nos partenaires et nous-mêmes.',
        image: polish,
        value: 'integrity',
      },
    ],
  },
  team: {
    eyebrow: 'Les bâtisseurs',
    title: 'Notre Équipe',
    description: 'Des passionnés qui œuvrent chaque jour pour donner vie à la vision de KLAN.',
    members: [
      {
        name: 'Youssef Mansouri',
        role: 'Fondateur & CEO',
        bio: 'Visionnaire passionné par la transmission intergénérationnelle et la construction communautaire.',
        image: avatar2,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'X', icon: 'twitter', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:youssef@klan.com' },
        ],
      },
      {
        name: 'Amina Belkacem',
        role: 'Directrice des Opérations',
        bio: 'Experte en gestion de communautés et en développement organisationnel.',
        image: avatar1,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:amina@klan.com' },
        ],
      },
      {
        name: 'Karim Ouadah',
        role: 'Directeur Technique',
        bio: 'Architecte logiciel spécialisé dans les plateformes communautaires à grande échelle.',
        image: avatar3,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'X', icon: 'twitter', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:karim@klan.com' },
        ],
      },
      {
        name: 'Sarah Dupont',
        role: 'Responsable Communauté',
        bio: 'Animatrice de communautés engagée, elle tisse les liens entre les membres de KLAN.',
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
    title: 'Rejoignez l\'aventure KLAN',
    description: 'Devenez acteur de cette construction collective. Chaque pierre compte dans l\'édifice commun.',
    primaryButton: { text: 'Rejoindre KLAN', href: '#' },
    secondaryButton: { text: 'Nous contacter', href: '#' },
  },
} satisfies AboutTranslations;
