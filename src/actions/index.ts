import { updateSiteSettings, upsertSiteSettings } from "./admin/site";
import { createSocialLink, updateSocialLink, deleteSocialLink, reorderSocialLinks } from "./admin/social";
import { updateContactInfo } from "./admin/contact";
import { updateOpeningHours } from "./admin/hours";
import { createNavigationMenu, updateNavigationMenu, deleteNavigationMenu } from "./admin/menus";
import { createNavigationItem, updateNavigationItem, deleteNavigationItem, reorderNavigationItems } from "./admin/navigation";
import { createPage, updatePage, deletePage, publishPage, schedulePage, unschedulePage, scheduleUnpublishPage, unscheduleUnpublishPage, restoreFromTrash, permanentlyDeletePage, bulkPublishPages, bulkArchivePages, bulkRestorePages, bulkDeletePages, clonePage, lockPage, unlockPage } from "./admin/pages";
import { createSection, updateSection, deleteSection, reorderSections } from "./admin/sections";
import { createTheme, updateTheme, deleteTheme } from "./admin/theme";
import { updateConsentSettings } from "./admin/consent";
import { createMediaFolder, updateMediaFolder, deleteMediaFolder, uploadMediaFile, renameMediaFile, moveMediaFile, deleteMediaFile, upsertMediaFileAlt, deleteMediaFileAlt } from "./admin/media";
import { createPageVersion, listPageVersions, restorePageVersion } from "./admin/versions";
import { listOrgRoles, createOrgRole, updateOrgRole, deleteOrgRole, updateMemberRole } from "./admin/roles";
import { orgListRoles, orgCreateRole, orgUpdateRole, orgDeleteRole, orgUpdateMemberRole } from "./org/roles";
import { createBlogPost, updateBlogPost, deleteBlogPost, publishBlogPost, unpublishBlogPost, archiveBlogPost, restoreBlogPost, duplicateBlogPost, restoreBlogPostRevision, lockBlogPost, unlockBlogPost, listBlogPostRevisions, recordBlogPostView, createBlogCategory, updateBlogCategory, deleteBlogCategory, createBlogTag, updateBlogTag, deleteBlogTag, createBlogComment, moderateBlogComment, createBlogReview, moderateBlogReview, voteBlogReviewHelpful, toggleBlogReaction, toggleBlogFavorite, createBlogReport, updateBlogReport, getBlogModerationQueue, markBlogNotificationRead, markAllBlogNotificationsRead, createBlogLink, updateBlogLink, deleteBlogLink, createBlogGallery, updateBlogGallery, deleteBlogGallery, addGalleryMedia, removeGalleryMedia, updateUserProfile, subscribeBlogNewsletter, confirmBlogSubscription, unsubscribeBlogNewsletter, checkBlogPostLinks, resolveBlogInternalLink } from "./blog";
import { createService, updateService } from "./services/service";
import { publishService, unpublishService, archiveService, restoreService, deleteService, duplicateService, lockService, unlockService, listServiceRevisions, restoreServiceRevision } from "./services/lifecycle";
import { toggleServiceFavorite, createServiceReview, createServiceComment, createServiceReport, voteServiceReviewHelpful } from "./services/engagement";
import { createServiceAvailability, updateServiceAvailability, deleteServiceAvailability } from "./services/availability";
import { toggleServiceReaction } from "./services/reactions";
import { listServiceNotifications, markServiceNotificationRead, markAllServiceNotificationsRead } from "./services/notification";
import { recordServiceView } from "./services/views";
import { createServiceAttributeDefinition, setServiceAttributeValue } from "./services/attributes";
import { createServiceCategory, updateServiceCategory, deleteServiceCategory, createServiceTag, updateServiceTag, deleteServiceTag } from "./services/taxonomy";
import { moderateServiceComment, moderateServiceReview, resolveServiceReport } from "./services/moderation";
import { addServiceMedia, updateServiceMedia, removeServiceMedia } from "./services/media";
import { resolveServiceInternalLink } from "./services/internal-link";

export const server = {
  updateSiteSettings, upsertSiteSettings, createSocialLink, updateSocialLink, deleteSocialLink, reorderSocialLinks, updateContactInfo, updateOpeningHours,
  createNavigationMenu, updateNavigationMenu, deleteNavigationMenu, createNavigationItem, updateNavigationItem, deleteNavigationItem, reorderNavigationItems,
  createPage, updatePage, deletePage, publishPage, schedulePage, unschedulePage, scheduleUnpublishPage, unscheduleUnpublishPage, restoreFromTrash, permanentlyDeletePage, bulkPublishPages, bulkArchivePages, bulkRestorePages, bulkDeletePages, clonePage, lockPage, unlockPage,
  createSection, updateSection, deleteSection, reorderSections, createTheme, updateTheme, deleteTheme, updateConsentSettings,
  createMediaFolder, updateMediaFolder, deleteMediaFolder, uploadMediaFile, renameMediaFile, moveMediaFile, deleteMediaFile, upsertMediaFileAlt, deleteMediaFileAlt,
  createPageVersion, listPageVersions, restorePageVersion, listOrgRoles, createOrgRole, updateOrgRole, deleteOrgRole, updateMemberRole, orgListRoles, orgCreateRole, orgUpdateRole, orgDeleteRole, orgUpdateMemberRole,
  createBlogPost, updateBlogPost, deleteBlogPost, publishBlogPost, unpublishBlogPost, archiveBlogPost, restoreBlogPost, duplicateBlogPost, restoreBlogPostRevision, lockBlogPost, unlockBlogPost, listBlogPostRevisions, recordBlogPostView, createBlogCategory, updateBlogCategory, deleteBlogCategory, createBlogTag, updateBlogTag, deleteBlogTag, createBlogComment, moderateBlogComment, createBlogReview, moderateBlogReview, voteBlogReviewHelpful, toggleBlogReaction, toggleBlogFavorite, createBlogReport, updateBlogReport, getBlogModerationQueue, markBlogNotificationRead, markAllBlogNotificationsRead, createBlogLink, updateBlogLink, deleteBlogLink, checkBlogPostLinks, resolveBlogInternalLink, createBlogGallery, updateBlogGallery, deleteBlogGallery, addGalleryMedia, removeGalleryMedia, updateUserProfile, subscribeBlogNewsletter, confirmBlogSubscription, unsubscribeBlogNewsletter,
  createService, updateService, publishService, unpublishService, archiveService, restoreService, deleteService, duplicateService, lockService, unlockService, listServiceRevisions, restoreServiceRevision,
  toggleServiceFavorite, createServiceReview, createServiceComment, createServiceReport, voteServiceReviewHelpful, createServiceAvailability, updateServiceAvailability, deleteServiceAvailability,
  toggleServiceReaction, listServiceNotifications, markServiceNotificationRead, markAllServiceNotificationsRead, recordServiceView, createServiceAttributeDefinition, setServiceAttributeValue,
  createServiceCategory, updateServiceCategory, deleteServiceCategory, createServiceTag, updateServiceTag, deleteServiceTag, moderateServiceComment, moderateServiceReview, resolveServiceReport, addServiceMedia, updateServiceMedia, removeServiceMedia, resolveServiceInternalLink,
};
