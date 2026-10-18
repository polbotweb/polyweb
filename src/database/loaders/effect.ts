/**
 * Façade Effect des loaders de lecture (src/database/loaders, services,
 * admin services, données d'administration better-auth `auth-data`).
 *
 * Chaque loader Promise (requêtes Drizzle + cache TTL `cached()`) est exposé en
 * `Effect<R, DbError>` avec un span `loader <nom>` : les pipelines Effect
 * (routes API, actions, services) les composent avec erreurs typées,
 * timeouts et retries sans `try/catch`.
 *
 * PARTIEL (assumé) : l'intérieur des loaders reste en Promise/Drizzle — le cache
 * TTL coalescent est partagé avec les pages `.astro`, qui appellent toujours
 * les versions Promise. Voir docs/effect.md (« État de la migration »).
 */
import { Effect } from 'effect';
import { DbError } from '@/lib/effect/errors';

import * as blogadmineditorLoader from './blog-admin-editor.loader';
import * as blogadminmoderationLoader from './blog-admin-moderation.loader';
import * as blogadminLoader from './blog-admin.loader';
import * as blogLoader from './blog.loader';
import * as consentLoader from './consent.loader';
import * as mediaLoader from './media.loader';
import * as navigationLoader from './navigation.loader';
import * as pageLoader from './page.loader';
import * as siteLoader from './site.loader';
import * as servicesLoader from '@/modules/services/loaders';
import * as servicesAdminLoader from '@/modules/services/admin/loader';
import * as authData from '@/lib/auth-data';

/** Élève un loader Promise en Effect typé (`DbError` avec la cause d'origine). */
export const liftLoader =
  <Args extends unknown[], R>(operation: string, loader: (...args: Args) => Promise<R>) =>
  (...args: Args): Effect.Effect<R, DbError> =>
    Effect.tryPromise({ try: () => loader(...args), catch: (cause) => new DbError({ operation, cause }) }).pipe(
      Effect.withSpan(`loader ${operation}`),
    );

export const BlogAdminEditorLoaderEffect = {
  getBlogPostEditorData: liftLoader('blog-admin-editor.getBlogPostEditorData', blogadmineditorLoader.getBlogPostEditorData),
};

export const BlogAdminModerationLoaderEffect = {
  getBlogAdminModerationCount: liftLoader('blog-admin-moderation.getBlogAdminModerationCount', blogadminmoderationLoader.getBlogAdminModerationCount),
};

export const BlogAdminLoaderEffect = {
  getBlogAdminPostData: liftLoader('blog-admin.getBlogAdminPostData', blogadminLoader.getBlogAdminPostData),
  getBlogAdminAuthors: liftLoader('blog-admin.getBlogAdminAuthors', blogadminLoader.getBlogAdminAuthors),
  getBlogAdminTags: liftLoader('blog-admin.getBlogAdminTags', blogadminLoader.getBlogAdminTags),
};

export const BlogLoaderEffect = {
  getBlogPostBySlug: liftLoader('blog.getBlogPostBySlug', blogLoader.getBlogPostBySlug),
  getBlogPosts: liftLoader('blog.getBlogPosts', blogLoader.getBlogPosts),
  getBlogAuthorByUsername: liftLoader('blog.getBlogAuthorByUsername', blogLoader.getBlogAuthorByUsername),
  getRelatedBlogPosts: liftLoader('blog.getRelatedBlogPosts', blogLoader.getRelatedBlogPosts),
  getBlogCategories: liftLoader('blog.getBlogCategories', blogLoader.getBlogCategories),
  getBlogCategoryBySlug: liftLoader('blog.getBlogCategoryBySlug', blogLoader.getBlogCategoryBySlug),
  getBlogTags: liftLoader('blog.getBlogTags', blogLoader.getBlogTags),
  getBlogTagBySlug: liftLoader('blog.getBlogTagBySlug', blogLoader.getBlogTagBySlug),
  getBlogComments: liftLoader('blog.getBlogComments', blogLoader.getBlogComments),
  getBlogReviews: liftLoader('blog.getBlogReviews', blogLoader.getBlogReviews),
  getBlogReviewStats: liftLoader('blog.getBlogReviewStats', blogLoader.getBlogReviewStats),
  getBlogPostLinks: liftLoader('blog.getBlogPostLinks', blogLoader.getBlogPostLinks),
  getBlogPostStats: liftLoader('blog.getBlogPostStats', blogLoader.getBlogPostStats),
  getBlogGalleriesWithMedia: liftLoader('blog.getBlogGalleriesWithMedia', blogLoader.getBlogGalleriesWithMedia),
  getBlogPostForAdmin: liftLoader('blog.getBlogPostForAdmin', blogLoader.getBlogPostForAdmin),
  getBlogPostsForAdmin: liftLoader('blog.getBlogPostsForAdmin', blogLoader.getBlogPostsForAdmin),
  getBlogModerationQueue: liftLoader('blog.getBlogModerationQueue', blogLoader.getBlogModerationQueue),
  getBlogNotifications: liftLoader('blog.getBlogNotifications', blogLoader.getBlogNotifications),
  getUnreadBlogNotificationCount: liftLoader('blog.getUnreadBlogNotificationCount', blogLoader.getUnreadBlogNotificationCount),
  getBlogPostSlugs: liftLoader('blog.getBlogPostSlugs', blogLoader.getBlogPostSlugs),
  getBlogValidLinkTargets: liftLoader('blog.getBlogValidLinkTargets', blogLoader.getBlogValidLinkTargets),
};

export const ConsentLoaderEffect = {
  getConsentSettings: liftLoader('consent.getConsentSettings', consentLoader.getConsentSettings),
};

export const MediaLoaderEffect = {
  getMediaFolders: liftLoader('media.getMediaFolders', mediaLoader.getMediaFolders),
  getMediaFoldersList: liftLoader('media.getMediaFoldersList', mediaLoader.getMediaFoldersList),
  getMediaFilesByFolder: liftLoader('media.getMediaFilesByFolder', mediaLoader.getMediaFilesByFolder),
  getMediaFile: liftLoader('media.getMediaFile', mediaLoader.getMediaFile),
  getAllMediaFiles: liftLoader('media.getAllMediaFiles', mediaLoader.getAllMediaFiles),
  getMediaFileCountsByFolder: liftLoader('media.getMediaFileCountsByFolder', mediaLoader.getMediaFileCountsByFolder),
  getMediaStats: liftLoader('media.getMediaStats', mediaLoader.getMediaStats),
};

export const NavigationLoaderEffect = {
  getMenu: liftLoader('navigation.getMenu', navigationLoader.getMenu),
  getMenusList: liftLoader('navigation.getMenusList', navigationLoader.getMenusList),
  getMenuMeta: liftLoader('navigation.getMenuMeta', navigationLoader.getMenuMeta),
};

export const PageLoaderEffect = {
  getPage: liftLoader('page.getPage', pageLoader.getPage),
  getPagesList: liftLoader('page.getPagesList', pageLoader.getPagesList),
  getPagePreview: liftLoader('page.getPagePreview', pageLoader.getPagePreview),
};

export const SiteLoaderEffect = {
  getSiteSettings: liftLoader('site.getSiteSettings', siteLoader.getSiteSettings),
  getSocialLinks: liftLoader('site.getSocialLinks', siteLoader.getSocialLinks),
  getContactInfo: liftLoader('site.getContactInfo', siteLoader.getContactInfo),
  getOpeningHours: liftLoader('site.getOpeningHours', siteLoader.getOpeningHours),
  getActiveTheme: liftLoader('site.getActiveTheme', siteLoader.getActiveTheme),
  getAllThemes: liftLoader('site.getAllThemes', siteLoader.getAllThemes),
  getActiveThemeCss: liftLoader('site.getActiveThemeCss', siteLoader.getActiveThemeCss),
};

export const ServicesLoaderEffect = {
  getServices: liftLoader('services.getServices', servicesLoader.getServices),
  getServiceBySlug: liftLoader('services.getServiceBySlug', servicesLoader.getServiceBySlug),
  getServiceByIdAdmin: liftLoader('services.getServiceByIdAdmin', servicesLoader.getServiceByIdAdmin),
  getServiceCategories: liftLoader('services.getServiceCategories', servicesLoader.getServiceCategories),
  getServiceTags: liftLoader('services.getServiceTags', servicesLoader.getServiceTags),
  getServiceProviders: liftLoader('services.getServiceProviders', servicesLoader.getServiceProviders),
};
export const ServicesAdminLoaderEffect = {
  getServiceAdminData: liftLoader('services-admin.getServiceAdminData', servicesAdminLoader.getServiceAdminData),
  getServiceAdminById: liftLoader('services-admin.getServiceAdminById', servicesAdminLoader.getServiceAdminById),
  getServiceAdminStats: liftLoader('services-admin.getServiceAdminStats', servicesAdminLoader.getServiceAdminStats),
  getServiceAdminTaxonomy: liftLoader('services-admin.getServiceAdminTaxonomy', servicesAdminLoader.getServiceAdminTaxonomy),
  getServiceModerationQueue: liftLoader('services-admin.getServiceModerationQueue', servicesAdminLoader.getServiceModerationQueue),
};

/** Données d'administration better-auth (utilisateurs, organisations, audit). */
export const AuthDataEffect = {
  fetchAdminUsers: liftLoader('auth-data.fetchAdminUsers', authData.fetchAdminUsers),
  fetchAdminOrgs: liftLoader('auth-data.fetchAdminOrgs', authData.fetchAdminOrgs),
  fetchAdminAuditLogs: liftLoader('auth-data.fetchAdminAuditLogs', authData.fetchAdminAuditLogs),
  fetchAdminStats: liftLoader('auth-data.fetchAdminStats', authData.fetchAdminStats),
  fetchOrgData: liftLoader('auth-data.fetchOrgData', authData.fetchOrgData),
  fetchOrgInvitations: liftLoader('auth-data.fetchOrgInvitations', authData.fetchOrgInvitations),
  fetchUserOrganizations: liftLoader('auth-data.fetchUserOrganizations', authData.fetchUserOrganizations),
  fetchUserInvitations: liftLoader('auth-data.fetchUserInvitations', authData.fetchUserInvitations),
};
