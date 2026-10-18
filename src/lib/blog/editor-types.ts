import type { Locale } from "@i18n/config";
import type { BlogPostStatus, BlogLinkType } from "./constants";

export interface BlogEditorTaxonomyOption {
  id: string;
  slug: string;
  label: string;
}

export interface BlogPostGalleryEditorItem {
  id: string;
  title: string | null;
  description: string | null;
  sortOrder: number;
  media: { mediaId: string; altText: string; caption: string | null; sortOrder: number }[];
}

export interface BlogPostLinkEditorItem {
  id: string;
  linkType: BlogLinkType;
  sortOrder: number;
  target: { id: string; slug: string; title: string | null };
}

export interface BlogPostRevisionEditorItem {
  revision: {
    id: string;
    title: string;
    slug: string;
    status: string;
    createdAt: Date;
  };
  author: { id: string; name: string | null } | null;
}

export interface BlogPostEditorData {
  post: {
    id: string;
    status: BlogPostStatus;
    featuredImageId: string | null;
    isFeatured: boolean;
    isSticky: boolean;
    commentStatus: "OPEN" | "CLOSED" | "DISABLED";
    allowReviews: boolean;
    seoScore: number | null;
    publishedAt: Date | null;
  };
  translation: {
    title: string;
    slug: string;
    content: string;
    excerpt: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    metaKeywords: string | null;
    canonicalUrl: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageId: string | null;
  } | null;
  seo: {
    focusKeyword: string | null;
    focusKeywordScore: number | null;
  } | null;
  galleries: BlogPostGalleryEditorItem[];
  links: BlogPostLinkEditorItem[];
  categoryIds: string[];
  tagIds: string[];
  revisions: BlogPostRevisionEditorItem[];
  lock: { userId: string; expiresAt: Date } | null;
  translations?: { locale: Locale; title: string; slug: string }[];
}

export type BlogPostUpdateInput = {
  id: string;
  organizationId?: string | null;
  locale?: Locale;
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  categoryIds?: string[];
  tagIds?: string[];
  featuredImageId?: string;
  ogImageId?: string;
  isFeatured?: boolean;
  isSticky?: boolean;
  commentStatus?: "OPEN" | "CLOSED" | "DISABLED";
  allowReviews?: boolean;
  seo?: {
    focusKeyword?: string;
    metaRobots?: "index,follow" | "noindex,follow" | "index,nofollow" | "noindex,nofollow";
    metaOgType?: "article" | "website" | "blog";
    metaTwitterCard?: "summary" | "summary_large_image";
    schemaMarkup?: Record<string, unknown>;
  };
};
