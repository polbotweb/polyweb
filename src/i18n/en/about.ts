import type { AboutTranslations } from '../config';
import { stone, bronze, houseCivilization, polish } from '../../assets/images/brand';
import { avatar1, avatar2, avatar3 } from '../../assets/images/avatars';

export default {
  meta: {
    title: 'About – KLAN',
    description: 'Discover the story, mission and team behind KLAN. We build civilization layer by layer.',
  },
  hero: {
    eyebrow: 'Our Story',
    title: 'Building civilization layer by layer',
    description: 'KLAN was born from a conviction: every generation builds upon the foundations left by those before it. Our mission is to structure this transmission so that every layer of knowledge, culture and experience is preserved and accessible.',
  },
  mission: {
    eyebrow: 'Our Purpose',
    title: 'Mission & Vision',
    description: 'Two pillars guide every decision we make.',
    cards: [
      {
        icon: 'mdi:target',
        title: 'Our Mission',
        description: 'Support communities that build on the legacy of those who came before. We create tools that enable intergenerational transmission of knowledge, values and resources.',
      },
      {
        icon: 'mdi:eye-outline',
        title: 'Our Vision',
        description: 'A world where every community can build sustainably, layer after layer, on solid foundations. Where collective heritage is not lost but amplified.',
      },
    ],
  },
  values: {
    eyebrow: 'What Defines Us',
    title: 'Our Values',
    description: 'The founding principles that guide KLAN every day.',
    items: [
      {
        title: 'Heritage',
        description: 'We believe the past is a treasure. Every piece of knowledge, every experience deserves to be preserved and passed on to future generations. Heritage is not a burden — it\'s a springboard.',
        image: stone,
        value: 'heritage',
      },
      {
        title: 'Transmission',
        description: 'Knowledge that is not passed on is knowledge lost. We do everything to ensure that wisdom flows freely between generations and communities.',
        image: bronze,
        value: 'transmission',
      },
      {
        title: 'Community',
        description: 'Alone we go fast, together we go far. KLAN places community at the center of everything. It is within the collective that the most ambitious and lasting projects are born.',
        image: houseCivilization,
        value: 'community',
      },
      {
        title: 'Integrity',
        description: 'Building on solid foundations requires transparency and authenticity. We are committed to acting with honesty towards our community, our partners and ourselves.',
        image: polish,
        value: 'integrity',
      },
    ],
  },
  team: {
    eyebrow: 'The Builders',
    title: 'Our Team',
    description: 'Passionate people who work every day to bring KLAN\'s vision to life.',
    members: [
      {
        name: 'Youssef Mansouri',
        role: 'Founder & CEO',
        bio: 'A visionary passionate about intergenerational transmission and community building.',
        image: avatar2,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'X', icon: 'twitter', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:youssef@klan.com' },
        ],
      },
      {
        name: 'Amina Belkacem',
        role: 'Operations Director',
        bio: 'Expert in community management and organizational development.',
        image: avatar1,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:amina@klan.com' },
        ],
      },
      {
        name: 'Karim Ouadah',
        role: 'CTO',
        bio: 'Software architect specialized in large-scale community platforms.',
        image: avatar3,
        socials: [
          { name: 'LinkedIn', icon: 'linkedin', href: '#' },
          { name: 'X', icon: 'twitter', href: '#' },
          { name: 'Email', icon: 'mail', href: 'mailto:karim@klan.com' },
        ],
      },
      {
        name: 'Sarah Dupont',
        role: 'Community Manager',
        bio: 'Committed community builder who weaves connections between KLAN members.',
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
    title: 'Join the KLAN adventure',
    description: 'Become part of this collective construction. Every stone counts in the common edifice.',
    primaryButton: { text: 'Join KLAN', href: '#' },
    secondaryButton: { text: 'Contact us', href: '#' },
  },
} satisfies AboutTranslations;
