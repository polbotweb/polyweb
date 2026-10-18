/**
 * Section content validation schemas.
 *
 * These schemas mirror the EXACT content keys consumed by SectionRenderer.astro.
 * Every key name, type, and nesting structure comes from reading the renderer —
 * nothing is invented. Used for:
 *   1. Validation in admin actions (createSection / updateSection)
 *   2. Generating admin editor forms (future)
 */

export type SectionFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'url'        // validated with safeUrl pattern (https, /, #, mailto:)
  | 'embed-url'  // validated with safeEmbedUrl (https:// only — iframes)
  | 'html'       // sanitized with DOMPurify
  | 'email'      // validated email address (RFC-ish)
  | 'items';     // array of objects — sub-fields defined in `itemFields`

export interface SectionFieldDef {
  key: string;
  type: SectionFieldType;
  required?: boolean;
  maxLength?: number;
  label: string;
  /** When type is 'items': describes the expected shape of each array element. */
  itemFields?: SectionFieldDef[];
  /** When type is 'items': maximum number of elements allowed. */
  maxItems?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas — every key maps 1-to-1 to what SectionRenderer.astro reads
// ─────────────────────────────────────────────────────────────────────────────

export const SECTION_SCHEMAS: Record<string, SectionFieldDef[]> = {
  /**
   * Hero — content.title, content.subtitle, content.ctaText, content.ctaUrl,
   *         content.image, content.imageAlt, content.imageWidth, content.imageHeight
   */
  hero: [
    { key: 'title', type: 'string', maxLength: 200, label: 'Titre' },
    { key: 'subtitle', type: 'string', maxLength: 500, label: 'Sous-titre' },
    { key: 'ctaText', type: 'string', maxLength: 100, label: 'Texte du bouton' },
    { key: 'ctaUrl', type: 'url', maxLength: 500, label: 'Lien du bouton' },
    { key: 'image', type: 'url', maxLength: 500, label: 'Image' },
    { key: 'imageAlt', type: 'string', maxLength: 300, label: "Texte alternatif de l'image" },
    { key: 'imageWidth', type: 'number', label: "Largeur de l'image" },
    { key: 'imageHeight', type: 'number', label: "Hauteur de l'image" },
  ],

  /** Text — content.html (falls back to content.raw in renderer) */
  text: [
    { key: 'html', type: 'html', required: true, maxLength: 50_000, label: 'Contenu HTML' },
  ],

  /** Image — content.src, content.alt, content.width, content.height, content.caption */
  image: [
    { key: 'src', type: 'url', required: true, maxLength: 500, label: "URL de l'image" },
    { key: 'alt', type: 'string', required: true, maxLength: 300, label: 'Texte alternatif' },
    { key: 'caption', type: 'string', maxLength: 500, label: 'Légende' },
    { key: 'width', type: 'number', label: 'Largeur' },
    { key: 'height', type: 'number', label: 'Hauteur' },
  ],

  /** Gallery — content.images[] each with {src, alt, width, height} */
  gallery: [
    {
      key: 'images', type: 'items', required: true, label: 'Images', maxItems: 100,
      itemFields: [
        { key: 'src', type: 'url', required: true, maxLength: 500, label: "URL de l'image" },
        { key: 'alt', type: 'string', maxLength: 300, label: 'Texte alternatif' },
        { key: 'width', type: 'number', label: 'Largeur' },
        { key: 'height', type: 'number', label: 'Hauteur' },
      ],
    },
  ],

  /** CTA — content.title, content.text, content.buttonText, content.buttonUrl */
  cta: [
    { key: 'title', type: 'string', maxLength: 200, label: 'Titre' },
    { key: 'text', type: 'string', maxLength: 1000, label: 'Texte descriptif' },
    { key: 'buttonText', type: 'string', required: true, maxLength: 100, label: 'Texte du bouton' },
    { key: 'buttonUrl', type: 'url', required: true, maxLength: 500, label: 'Lien du bouton' },
  ],

  /** Features — content.title, content.items[] each with {title, description, icon} */
  features: [
    { key: 'title', type: 'string', maxLength: 200, label: 'Titre' },
    {
      key: 'items', type: 'items', required: true, label: 'Fonctionnalités', maxItems: 50,
      itemFields: [
        { key: 'title', type: 'string', required: true, maxLength: 200, label: 'Titre' },
        { key: 'description', type: 'string', required: true, maxLength: 1000, label: 'Description' },
        { key: 'icon', type: 'string', maxLength: 50, label: 'Icône (emoji ou classe)' },
      ],
    },
  ],

  /** Testimonials — content.title, content.items[] each with {quote, author, role} */
  testimonials: [
    { key: 'title', type: 'string', maxLength: 200, label: 'Titre' },
    {
      key: 'items', type: 'items', required: true, label: 'Témoignages', maxItems: 50,
      itemFields: [
        { key: 'quote', type: 'string', required: true, maxLength: 2000, label: 'Citation' },
        { key: 'author', type: 'string', required: true, maxLength: 200, label: 'Auteur' },
        { key: 'role', type: 'string', maxLength: 200, label: 'Rôle / Poste' },
      ],
    },
  ],

  /** FAQ — content.title, content.items[] each with {question, answer} */
  faq: [
    { key: 'title', type: 'string', maxLength: 200, label: 'Titre' },
    {
      key: 'items', type: 'items', required: true, label: 'Questions / Réponses', maxItems: 100,
      itemFields: [
        { key: 'question', type: 'string', required: true, maxLength: 500, label: 'Question' },
        { key: 'answer', type: 'string', required: true, maxLength: 5000, label: 'Réponse' },
      ],
    },
  ],

  /** Contact — content.title, content.text, content.email, content.phone */
  contact: [
    { key: 'title', type: 'string', maxLength: 200, label: 'Titre' },
    { key: 'text', type: 'string', maxLength: 1000, label: 'Texte descriptif' },
    { key: 'email', type: 'email', maxLength: 254, label: 'Adresse e-mail' },
    { key: 'phone', type: 'string', maxLength: 30, label: 'Téléphone' },
  ],

  /** Map — content.embedUrl (iframe src, https:// only via safeEmbedUrl) */
  map: [
    { key: 'embedUrl', type: 'embed-url', required: true, maxLength: 1000, label: "URL d'intégration (Google Maps, etc.)" },
  ],

  /** Video — content.embedUrl (iframe src), content.caption */
  video: [
    { key: 'embedUrl', type: 'embed-url', required: true, maxLength: 1000, label: "URL d'intégration (YouTube, Vimeo, etc.)" },
    { key: 'caption', type: 'string', maxLength: 500, label: 'Légende' },
  ],

  /** Custom — content.html (sanitized) */
  custom: [
    { key: 'html', type: 'html', required: true, maxLength: 100_000, label: 'HTML personnalisé' },
  ],
};

/** Available section types from the schema definitions. */
export const SECTION_TYPES = Object.keys(SECTION_SCHEMAS) as string[];

const URL_PATTERN = /^(https?:\/\/|\/(?!\/)|#|mailto:)/;
const EMBED_URL_PATTERN = /^https:\/\//;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate section content against its type schema.
 * Returns an array of error messages (empty if valid).
 */
export function validateSectionContent(type: string, content: Record<string, unknown>): string[] {
  const schema = SECTION_SCHEMAS[type];
  if (!schema) return []; // unknown types pass through (forward-compat)

  return validateFields(schema, content, type);
}

function validateFields(
  fields: SectionFieldDef[],
  obj: Record<string, unknown>,
  context: string,
): string[] {
  const errors: string[] = [];

  for (const field of fields) {
    const value = obj[field.key];

    // Required check
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push(`Le champ « ${field.label} » est requis pour « ${context} ».`);
      continue;
    }

    if (value === undefined || value === null || value === '') continue;

    // Type checks
    switch (field.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`Le champ « ${field.label} » doit être une chaîne de caractères.`);
        } else if (field.maxLength && value.length > field.maxLength) {
          errors.push(`Le champ « ${field.label} » dépasse ${field.maxLength} caractères.`);
        }
        break;

      case 'html':
        if (typeof value !== 'string') {
          errors.push(`Le champ « ${field.label} » doit être une chaîne HTML.`);
        } else if (field.maxLength && value.length > field.maxLength) {
          errors.push(`Le champ « ${field.label} » dépasse ${field.maxLength} caractères.`);
        }
        break;

      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(`Le champ « ${field.label} » doit être un nombre.`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`Le champ « ${field.label} » doit être un booléen.`);
        }
        break;

      case 'url':
        if (typeof value !== 'string') {
          errors.push(`Le champ « ${field.label} » doit être une URL.`);
        } else {
          if (field.maxLength && value.length > field.maxLength) {
            errors.push(`Le champ « ${field.label} » dépasse ${field.maxLength} caractères.`);
          }
          if (!URL_PATTERN.test(value)) {
            errors.push(`Le champ « ${field.label} » doit être une URL valide (http(s)://, / ou mailto:).`);
          }
        }
        break;

      case 'embed-url':
        if (typeof value !== 'string') {
          errors.push(`Le champ « ${field.label} » doit être une URL d'intégration.`);
        } else {
          if (field.maxLength && value.length > field.maxLength) {
            errors.push(`Le champ « ${field.label} » dépasse ${field.maxLength} caractères.`);
          }
          if (!EMBED_URL_PATTERN.test(value)) {
            errors.push(`Le champ « ${field.label} » doit être une URL HTTPS (requis pour les iframes).`);
          }
        }
        break;

      case 'email':
        if (typeof value !== 'string') {
          errors.push(`Le champ « ${field.label} » doit être une adresse e-mail.`);
        } else {
          if (field.maxLength && value.length > field.maxLength) {
            errors.push(`Le champ « ${field.label} » dépasse ${field.maxLength} caractères.`);
          }
          if (!EMAIL_PATTERN.test(value)) {
            errors.push(`Le champ « ${field.label} » n'est pas une adresse e-mail valide.`);
          }
        }
        break;

      case 'items':
        if (!Array.isArray(value)) {
          errors.push(`Le champ « ${field.label} » doit être un tableau.`);
        } else if (field.maxItems && value.length > field.maxItems) {
          errors.push(`Le champ « ${field.label} » ne peut pas contenir plus de ${field.maxItems} éléments.`);
        } else if (field.itemFields) {
          for (let i = 0; i < value.length; i++) {
            const item = value[i];
            if (!item || typeof item !== 'object') {
              errors.push(`L'élément ${i + 1} de « ${field.label} » doit être un objet.`);
              continue;
            }
            const itemErrors = validateFields(
              field.itemFields,
              item as Record<string, unknown>,
              `${context} > ${field.label}[${i + 1}]`,
            );
            errors.push(...itemErrors);
          }
        }
        break;
    }
  }

  return errors;
}
