export const SERVICE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED", "DELETED"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
export type ServiceCategoryId = string;
export type ServiceTagId = string;

export interface ServiceTranslation {
  locale: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  locationLabel: string | null;
  locationAddress: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageId: string | null;
}

export interface ServiceCoverMedia { id: string; url: string; alt: string; }

export interface ServiceRevisionSummary {
  id: string;
  locale: string;
  title: string;
  slug: string;
  status: ServiceStatus;
  revisionNote: string | null;
  createdAt: Date;
}

export interface ServiceLockState {
  userId: string;
  sessionId: string;
  lockedAt: Date;
  expiresAt: Date;
}

export interface ServiceListItem {
  service: {
    id: string;
    organizationId: string | null;
    providerId: string;
    slug: string;
    status: ServiceStatus;
    coverImageId: string | null;
    priceMinor: number | null;
    currency: string | null;
    durationMinutes: number | null;
    maxParticipants: number | null;
    isMobile: boolean;
    isFeatured: boolean;
    viewCount: number;
    ratingAverage100: number;
    ratingCount: number;
    seoScore: number | null;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  translation: ServiceTranslation | null;
  provider: { id: string; name: string | null; image: string | null } | null;
  categories: { id: string; slug: string; name: string | null }[];
  coverMedia: ServiceCoverMedia | null;
}

export interface ServiceDetail {
  service: ServiceListItem["service"];
  translation: ServiceTranslation | null;
  provider: ServiceListItem["provider"];
  categories: ServiceListItem["categories"];
  coverMedia: ServiceListItem["coverMedia"];
  tags: { id: string; slug: string; name: string | null }[];
  media: { id: string; mediaId: string; kind: "GALLERY" | "DOCUMENT"; altText: string; caption: string | null; sortOrder: number }[];
  availability: { id: string; dayOfWeek: number; startTime: string; endTime: string; timezone: string; maxParticipants: number | null }[];
  seo: { locale: string; focusKeyword: string | null; metaRobots: string | null; schemaMarkup: string | null } | null;
  availableLocales: readonly string[];
  revisions: readonly ServiceRevisionSummary[];
  lock: ServiceLockState | null;
}

export const SERVICE_REACTION_TYPES = ["LIKE", "LOVE", "FIRE", "CLAP"] as const;
export type ServiceReactionType = (typeof SERVICE_REACTION_TYPES)[number];
