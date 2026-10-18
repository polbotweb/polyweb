import type { HomeTranslations } from '../config';
import { houseCivilization, stratesCivilization, stone, polish, bronze, fer } from '../../assets/images/brand';
import { avatar1, avatar2, avatar3 } from '../../assets/images/avatars';

export default {
  hero: {
    badge: 'Building together',
    title: 'Civilization is built layer by layer',
    description:
      'KLAN supports communities that build on the legacy of those who came before. Each generation adds its stone to the common edifice.',
    ctaPrimary: 'Join the movement',
    ctaSecondary: 'Discover our vision',
    socialProofHeading: 'Join 10,000+ builders',
    socialProofSubtext: 'Building the future together',
    carouselImages: [
      { src: houseCivilization, alt: 'Ancestral house symbolizing the layers of civilization' },
      { src: stratesCivilization, alt: 'Geological strata symbolizing the accumulation of knowledge' },
    ],
  },
  logos: [
    { name: 'Atlas Foundation', src: stone },
    { name: 'Heritage Network', src: polish },
    { name: 'Roots Collective', src: bronze },
    { name: 'Builders Alliance', src: fer },
  ],
  pillars: {
    badge: 'Founding pillars',
    title: 'The foundations of KLAN',
    description: 'Four principles guide our mission of collective building.',
    items: [
      { icon: 'mdi:account-group', title: 'Community', description: 'Bringing together those who share a common vision and build together.' },
      { icon: 'mdi:book-open-variant', title: 'Transmission', description: 'Preserving and passing on knowledge from one generation to the next.' },
      { icon: 'mdi:shield-check', title: 'Integrity', description: 'Building on solid foundations, with transparency and authenticity.' },
      { icon: 'mdi:trending-up', title: 'Progress', description: 'Each layer builds on the previous one to reach higher.' },
    ],
  },
  testimonials: {
    badge: 'Testimonials',
    heading: 'They build with KLAN',
    description: 'Discover how our community of builders is shaping the future together.',
    items: [
      {
        name: 'Amina Belkacem',
        role: 'Founder, Roots Collective',
        content: 'KLAN helped us structure our intergenerational transmission. Every layer of knowledge is preserved and accessible.',
        rating: 5,
        image: avatar1,
      },
      {
        name: 'Youssef Mansouri',
        role: 'Director, Memory Institute',
        content: 'KLAN\'s vision deeply resonates with our mission. Building on the foundations of those who came before us.',
        rating: 5,
        image: avatar2,
      },
      {
        name: 'Sarah Dupont',
        role: 'Community Manager',
        content: 'An essential tool for uniting our community. The layered approach gives meaning to every contribution.',
        rating: 4,
        image: avatar3,
      },
      {
        name: 'Karim Ouadah',
        role: 'Architect, Builders Alliance',
        content: 'KLAN embodies what every community platform should be: a collective edifice where everyone contributes their stone.',
        rating: 5,
        image: avatar1,
      },
    ],
  },
  pricing: {
    eyebrow: 'Pricing',
    heading: 'Choose Your Plan',
    description: 'Select the perfect plan for your needs. Upgrade or downgrade at any time.',
    monthlyLabel: 'Monthly',
    yearlyLabel: 'Yearly',
    discountBadge: 'Save 20%',
    plans: [
      {
        name: 'Builder',
        description: 'For those who actively build within the community.',
        monthlyPrice: '29',
        yearlyPrice: '279',
        features: [
          { text: 'Community access', included: true },
          { text: 'Core content', included: true },
          { text: 'Transmission workshops', included: true },
          { text: 'Community mentoring', included: true },
          { text: 'Collaboration tools', included: true },
        ],
        buttonText: 'Become a builder',
        buttonHref: '#',
      },
      {
        name: 'Pillar',
        description: 'For leaders who carry the vision and guide the community.',
        monthlyPrice: '79',
        yearlyPrice: '759',
        features: [
          { text: 'Everything in Builder', included: true },
          { text: 'Pillars circle', included: true },
          { text: 'Exclusive events', included: true },
          { text: 'Roadmap influence', included: true },
          { text: 'Dedicated support', included: true },
          { text: 'Full API access', included: true },
        ],
        buttonText: 'Join the pillars',
        buttonHref: '#',
      },
    ],
  },
  ctaBanner: {
    title: 'Ready to build your layer?',
    description: 'Join thousands of builders shaping the future together with KLAN.',
    primaryButton: { text: 'Join KLAN', href: '#' },
    secondaryButton: { text: 'Learn more →', href: '#' },
  },
} satisfies HomeTranslations;
