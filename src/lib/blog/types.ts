import type {
  blogPosts,
  blogPostTranslations,
  blogCategories,
  blogCategoryTranslations,
  blogTags,
  blogTagTranslations,
  blogComments,
  blogCommentModerations,
  blogPostRevisions,
  blogPostGalleries,
  blogPostGalleryMedia,
  blogPostReviews,
  blogPostReviewHelpful,
  blogReports,
  blogPostFavorites,
  blogPostReactions,
  blogPostSeo,
  blogPostViewStats,
  blogNotifications,
  blogPostLocks,
  blogPostLinks,
} from "@database/schemas";
import type { Locale } from "@i18n/config";
import type {
  BlogPostStatus,
  BlogReactionType,
} from "./constants";

export type BlogPost = typeof blogPosts.$inferSelect;
export type BlogPostTranslation = typeof blogPostTranslations.$inferSelect;
export type BlogCategory = typeof blogCategories.$inferSelect;
export type BlogCategoryTranslation = typeof blogCategoryTranslations.$inferSelect;
export type BlogTag = typeof blogTags.$inferSelect;
export type BlogTagTranslation = typeof blogTagTranslations.$inferSelect;
export type BlogComment = typeof blogComments.$inferSelect;
export type BlogCommentModeration = typeof blogCommentModerations.$inferSelect;
export type BlogPostRevision = typeof blogPostRevisions.$inferSelect;
export type BlogPostGallery = typeof blogPostGalleries.$inferSelect;
export type BlogPostGalleryMedia = typeof blogPostGalleryMedia.$inferSelect;
export type BlogPostReview = typeof blogPostReviews.$inferSelect;
export type BlogPostReviewHelpful = typeof blogPostReviewHelpful.$inferSelect;
export type BlogReport = typeof blogReports.$inferSelect;
export type BlogPostFavorite = typeof blogPostFavorites.$inferSelect;
export type BlogPostReaction = typeof blogPostReactions.$inferSelect;
export type BlogPostSeo = typeof blogPostSeo.$inferSelect;
export type BlogPostViewStat = typeof blogPostViewStats.$inferSelect;
export type BlogNotification = typeof blogNotifications.$inferSelect;
export type BlogPostLock = typeof blogPostLocks.$inferSelect;
export type BlogPostLink = typeof blogPostLinks.$inferSelect;

export interface BlogPostWithRelations extends BlogPost {
  translations: BlogPostTranslation[];
  categories: { category: BlogCategory & { translations: BlogCategoryTranslation[] } }[];
  tags: { tag: BlogTag & { translations: BlogTagTranslation[] } }[];
  author: { id: string; name: string; email: string; image: string | null } | null;
  featuredImage: { id: string; url: string; width: number | null; height: number | null } | null;
  galleries: (BlogPostGallery & { media: (BlogPostGalleryMedia & { file: { id: string; url: string } })[] })[];
  seo: BlogPostSeo[];
  reactions: BlogPostReaction[];
}

export interface BlogPostListItem {
  post: BlogPost;
  translation: BlogPostTranslation | null;
  author: { id: string; name: string; image: string | null } | null;
  featuredImage: { id: string; url: string } | null;
  categories: { id: string; slug: string; name: string | null }[];
  tags: { id: string; slug: string; name: string | null }[];
  commentCount: number;
  reactionCounts: Record<BlogReactionType, number>;
  /** Moyenne des avis approuvés (null si aucun avis) */
  rating: number | null;
  /** Nombre d'avis approuvés */
  reviewCount: number;
}

export interface BlogCategoryWithTranslations extends BlogCategory {
  translations: BlogCategoryTranslation[];
  postCount: number;
}

export interface BlogTagWithTranslations extends BlogTag {
  translations: BlogTagTranslation[];
  postCount: number;
}

export interface BlogCommentWithAuthor extends BlogComment {
  author: { id: string; name: string; image: string | null } | null;
  replies: BlogCommentWithAuthor[];
  moderationCount: number;
}

export interface BlogReviewWithAuthor extends BlogPostReview {
  author: { id: string; name: string; image: string | null } | null;
  userVote: boolean | null;
}

export interface BlogPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface BlogPostFilters {
  page?: number;
  limit?: number;
  categorySlug?: string;
  tagSlug?: string;
  authorId?: string;
  status?: BlogPostStatus;
  searchQuery?: string;
  sortBy?: "publishedAt" | "viewCount" | "title" | "createdAt";
  sortOrder?: "asc" | "desc";
  featuredOnly?: boolean;
}

export interface BlogSeoInput {
  focusKeyword?: string;
  metaRobots?: "index,follow" | "noindex,follow" | "index,nofollow" | "noindex,nofollow";
  metaOgType?: "article" | "website" | "blog";
  metaTwitterCard?: "summary" | "summary_large_image";
  schemaMarkup?: Record<string, unknown>;
}

export interface BlogPostFormInput {
  locale: Locale;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  status: BlogPostStatus;
  categoryIds?: string[];
  tagIds?: string[];
  featuredImageId?: string;
  ogImageId?: string;
  isFeatured?: boolean;
  isSticky?: boolean;
  commentStatus?: "OPEN" | "CLOSED" | "DISABLED";
  allowReviews?: boolean;
  publishedAt?: Date;
  seo?: BlogSeoInput;
}

export type BlogScope = {
  organizationId: string | null;
};
