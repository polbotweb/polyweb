# Atomic

[**EN**](./README.md) | [FR](./README.fr.md) | [AR](./README.ar.md) | [ES](./README.es.md)

Full-stack SSR web application — authentication, organisations, CMS, media, SMTP and i18n across 4 locales.

_This README is auto-generated to provide comprehensive context for AI assistance._

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Design System](#design-system)
- [Database](#database)
- [Authentication](#authentication)
- [Content & CMS](#content-cms)
- [Media](#media)
- [Email & Notifications](#email-notifications)
- [Internationalisation](#internationalisation)
- [CI/CD & Quality](#cicd-quality)

## Overview

SSR multi-language web application with complete authentication, organisation management, CMS, media upload, and audit trail.

- ⚡ **Astro 6** (SSR, `@astrojs/node`) — Server-side rendering, Tailwind CSS 4, TypeScript
- 🔐 **better-auth** — Email/password, email verification, organisations, roles, admin impersonation
- 🗄️ **Drizzle ORM** + **PostgreSQL 16** — Type-safe migrations, loaders, full-text search
- 🎨 **Starwind** — 47+ accessible Astro UI components
- 🌍 **i18n** — fr, en, es, ar (RTL) with localised routes
- 📋 **CMS** — Pages, typed JSON sections, navigation, scheduling, versioning, import/export
- 📁 **Media** — Upload, Sharp image processing, folder organisation
- 📧 **SMTP** — Brevo / Resend / Nodemailer + dead-letter queue
- 🛡️ **Security** — Audit trail, rate limiting, input sanitization
- ✅ **Testing** — 741 Vitest + 34 E2E Playwright scenarios × 3 browsers

### Tech Stack

| Technology | Role |
|:--|:--|
| **Astro 6** (`@astrojs/node`) | SSR framework |
| **better-auth** | Auth, organisations, sessions |
| **Drizzle ORM** + **PostgreSQL 16** | Database |
| **Tailwind CSS 4** + **Starwind** | Design system (47+ components) |
| **Vitest** + **Playwright** | Unit, integration & E2E tests |
| **GitHub Actions** | CI/CD |

## Getting Started

### Prerequisites

- **Node.js** >= 22.12.0
- **pnpm** >= 10
- **PostgreSQL** >= 16

### Installation

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

### Environment Variables

| Variable | Description |
|:---------|:------------|
| `DB_ENV` | Active DB environment (LOCAL | PROD | TEST) |
| `DATABASE_URL_LOCAL` | PostgreSQL connection URL — local environment |
| `DATABASE_URL_PROD` | PostgreSQL connection URL — production environment |
| `DATABASE_URL_TEST` | PostgreSQL connection URL — test suite |
| `BETTER_AUTH_SECRET` | Auth secret key (min. 32 random chars) |
| `BETTER_AUTH_URL` | Public URL of the application (used by better-auth) |
| `SITE_URL` | Canonical URL used by Astro / sitemap |
| `SMTP_PROVIDER` | Email provider: BREVO | RESEND | NODEMAILER |
| `SMTP_FROM_EMAIL` | Sender email address |
| `SMTP_FROM_NAME` | Sender display name |
| `SMTP_HOST` | SMTP server hostname (Nodemailer only) |
| `SMTP_PORT` | SMTP server port, e.g. 587 (Nodemailer only) |
| `SMTP_SECURE` | Enable TLS/SSL — true | false (Nodemailer only) |

### TypeScript Aliases

- `@/*` → `src/*`
- `@styles/*` → `src/styles/*`
- `@layouts/*` → `src/layouts/*`
- `@components/*` → `src/components/*`
- `@atoms/*` → `src/components/atoms/*`
- `@molecules/*` → `src/components/molecules/*`
- `@organisms/*` → `src/components/organisms/*`
- `@wow/*` → `src/components/wow/*`
- `@assets/*` → `src/assets/*`
- `@starwind/*` → `src/lib/starwind/*`
- `@i18n/*` → `src/i18n/*`
- `@pages/*` → `src/components/pages/*`
- `@lib/*` → `src/lib/*`
- `@database/*` → `src/database/*`
- `@smtp/*` → `src/smtp/*`
- `@media/*` → `src/media/*`

## Design System

### Files

```
src/components/
atoms/
  accordion/
  alert/
  alert-dialog/
  aspect-ratio/
  avatar/
  badge/
  breadcrumb/
  button/
  button-group/
  card/
  carousel/
  checkbox/
  collapsible/
  container/
  dialog/
  dropdown/
  dropzone/
  icon-picker/
  image/
  input/
  input-group/
  input-otp/
  item/
  kbd/
  label/
  media-picker/
  native-select/
  pagination/
  popover/
  progress/
  prose/
  radio-group/
  select/
  separator/
  sheet/
  sidebar/
  skeleton/
  slider/
  spinner/
  switch/
  table/
  tabs/
  textarea/
  theme-toggle/
  toast/
  toggle/
  tooltip/
  video/
blog/
  AdminModerationQueue.astro
  AdminPostForm.astro
  AdminPostList.astro
  AdminTaxonomyManager.astro
  ArticleProgressBar.astro
  AuthorCard.astro
  BlogAdminPage.astro
  cards/
  CategoryFilterBar.astro
  CommentForm.astro
  comments/
  CommentSection.astro
  CommentThreadItem.astro
  grids/
  NotificationBell.astro
  PostCard.astro
  PostContent.astro
  PostGridToggle.astro
  ReactionBar.astro
  ReviewForm.astro
  ReviewSection.astro
  ShareBar.astro
  sidebars/
  TagCloud.astro
content/
  ContentEditor.astro
  RichContent.astro
molecules/
  AdminPagination/
  AdminResourceStats.astro
  DataView/
organisms/
  AdminFormShell.astro
  AdminResourceList.astro
  AdminResourceShell.astro
  AdminSidebar/
  AuthLayout/
  AuthSidebar/
  Category/
  CookieConsent/
  Footer/
  Header/
  OrgSidebar/
  Testimonials/
pages/
  AboutPage/
  admin/
  auth/
  blog/
  cms/
  CmsPage.astro
  ContactPage/
  HomePage/
  LegalPage.astro
  org/
services/
  AdminServiceForm.astro
  AdminServiceList.astro
  ServicesAdminPage.astro
starwind/
  blog/
wow/
  AsyncButton.astro
  FallingParticles.astro
  HorizontalScrollCarousel/
  HoverBlurCards.astro
  LogoCloud.astro
  MarqueeContent.astro
  MouseRepelParticles.astro
  RisingParticles.astro
  ScrollReveal.astro
src/styles/
global.css
src/assets/
images/
  avatars/
  brand/
```

### Components

- **atoms/** — 48 components
- **molecules/** — 3 components
- **organisms/** — 12 components
- **pages/** — 10 components
- **wow/** — 9 components

### Styles & Tokens

`global.css` — 86 CSS custom properties

```css
--animate-accordion-down: accordion-down 0.2s ease-out;
--animate-accordion-up: accordion-up 0.2s ease-out;
--color-background: var(--background);
--color-foreground: var(--foreground);
--color-card: var(--card);
--color-card-foreground: var(--card-foreground);
/* ... 80 more */
```

### Tests

- `tests/unit/sanitize.test.ts`
- `tests/unit/section-content-xss.test.ts`
- `tests/unit/section-schemas.test.ts`
- `tests/unit/sections-sanitize.test.ts`
- `tests/unit/seo.test.ts`
- `tests/unit/theme-tokens.test.ts`

## Database

### Files

```
src/database/
cache.ts
commands/
  db.check.ts
  db.clean-media.ts
  db.cleanup-audit.ts
  db.compare.ts
  db.generate.ts
  db.infra.ts
  db.migrate.ts
  db.reset.ts
  db.seed-media.ts
  db.seed.ts
  db.sync.ts
  _utils.ts
data/
  00-media.data.ts
  00b-media-files.data.ts
  01-users.data.ts
  01b-user-accounts.data.ts
  02-organizations.data.ts
  02b-organization-members.data.ts
  03-site-settings.data.ts
  04-social-links.data.ts
  05-contact-info.data.ts
  06-opening-hours.data.ts
  07-navigation.data.ts
  07b-navigation-items.data.ts
  08-theme.data.ts
  09-legal-pages.data.ts
  09b-legal-sections.data.ts
  10-consent-settings.data.ts
  11-blog-categories.data.ts
  11b-blog-category-translations.data.ts
  12-blog-tags.data.ts
  12b-blog-tag-translations.data.ts
  13-blog-posts.data.ts
  13b-blog-post-translations.data.ts
  14-blog-post-categories.data.ts
  14b-blog-post-tags.data.ts
  15-blog-post-seo.data.ts
  15b-blog-post-revisions.data.ts
  16-blog-comments.data.ts
  16b-blog-comment-moderations.data.ts
  17-blog-reviews.data.ts
  17b-blog-review-helpful.data.ts
  18-blog-reactions.data.ts
  18b-blog-favorites.data.ts
  19-blog-reports.data.ts
  20-blog-post-links.data.ts
  20b-blog-post-locks.data.ts
  21-blog-notifications.data.ts
  22-blog-subscribers.data.ts
  23-blog-post-galleries.data.ts
  23b-blog-post-gallery-media.data.ts
  24-services.data.ts
  24b-service-translations.data.ts
  25-service-categories.data.ts
  25b-service-category-translations.data.ts
  26-service-tags.data.ts
  26b-service-tag-translations.data.ts
  27-service-category-links.data.ts
  27b-service-tag-links.data.ts
  28-service-media.data.ts
  29-service-availability.data.ts
  30-service-revisions.data.ts
  31-service-locks.data.ts
  32-service-seo.data.ts
  33-service-favorites.data.ts
  34-service-reviews.data.ts
  34b-service-review-helpful.data.ts
  35-service-comments.data.ts
  36-service-reports.data.ts
  37-service-view-stats.data.ts
  38-service-reactions.data.ts
  39-service-notifications.data.ts
  40-service-attribute-definitions.data.ts
  40b-service-attribute-values.data.ts
  manifest.ts
drizzle.ts
env.ts
infra/
  00-functions.sql
  01-triggers.sql
  02-indexes.sql
  03-constraints.sql
loaders/
  blog-admin-editor.loader.ts
  blog-admin-moderation.loader.ts
  blog-admin.loader.ts
  blog.loader.ts
  consent.loader.ts
  media.loader.ts
  navigation.loader.ts
  page.loader.ts
  site.loader.ts
migrations/
  0000_plain_old_lace.sql
  0001_numerous_ken_ellis.sql
  0002_sticky_blazing_skull.sql
  0003_brief_senator_kelly.sql
  0004_flashy_ezekiel_stane.sql
  0005_hard_joseph.sql
  0006_services_module.sql
  0007_services_search.sql
  0007_services_search_vector.sql
  0008_services_notification_targets.sql
  meta/
    0000_snapshot.json
    0001_snapshot.json
    0002_snapshot.json
    0003_snapshot.json
    0004_snapshot.json
    0005_snapshot.json
    _journal.json
schemas/
  audit-log.schema.ts
  auth.schema.ts
  blog.schema.ts
  consent.schema.ts
  media.schema.ts
  navigation.schema.ts
  page-version.schema.ts
  page.schema.ts
  services-engagement.schema.ts
  services.schema.ts
  site.schema.ts
schemas.ts
```

### Schemas & Tables

**auth.schema.ts**
- `user`: `id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt`, `username`, `displayUsername`, `bio`, `website`, `twitter`, `linkedin`, `role`, `banned`, `banReason`, `banExpires` _(sessions: many, accounts: many, members: many, invitations: many)_
- `session`: `id`, `expiresAt`, `token`, `createdAt`, `updatedAt`, `ipAddress`, `userAgent`, `userId`, `impersonatedBy`, `activeOrganizationId` _(user: one)_
- `account`: `id`, `accountId`, `providerId`, `userId`, `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password`, `createdAt`, `updatedAt` _(user: one)_
- `verification`: `id`, `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`
- `organization`: `id`, `name`, `slug`, `logo`, `createdAt`, `updatedAt`, `metadata` _(organizationRoles: many, members: many, invitations: many)_
- `member`: `id`, `organizationId`, `userId`, `role`, `createdAt` _(organization: one, user: one)_
- `invitation`: `id`, `organizationId`, `email`, `role`, `status`, `expiresAt`, `createdAt`, `inviterId` _(organization: one, user: one)_
- `organization_role`: `id`, `organizationId`, `role`, `permission`, `createdAt`, `updatedAt` _(organization: one)_

**audit-log.schema.ts**
- `audit_log`: `id`, `userId`, `action`, `resource`, `resourceId`, `metadata`, `ipAddress`, `userAgent`, `createdAt` _(user: one)_

**site.schema.ts**
- `site_settings`: `id`, `locale`, `siteName`, `siteDescription`, `siteSlogan`, `metaTitle`, `metaDescription`, `logoLight`, `logoDark`, `favicon`, `ogImage`, `headerCtaText`, `headerCtaUrl`, `headerSecondaryText`, `headerSecondaryUrl`, `headerSticky`, `footerCopyrightText`, `footerCopyrightUrl`, `footerSocialHeading`, `footerNavPrimaryHeading`, `footerNavSecondaryHeading`, `footerLegalHeading`, `createdAt`, `updatedAt`
- `social_links`: `id`, `platform`, `url`, `icon`, `label`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`
- `contact_info`: `id`, `email`, `phone`, `address`, `city`, `postalCode`, `country`, `mapUrl`, `latitude`, `longitude`, `createdAt`, `updatedAt`
- `opening_hours`: `id`, `dayOfWeek`, `openTime`, `closeTime`, `hasMiddayBreak`, `morningOpen`, `morningClose`, `afternoonOpen`, `afternoonClose`, `isClosed`, `createdAt`, `updatedAt`
- `theme_settings`: `id`, `name`, `isActive`, `lightTokens`, `darkTokens`, `primaryColor`, `secondaryColor`, `accentColor`, `backgroundColor`, `foregroundColor`, `mutedColor`, `mutedForegroundColor`, `fontHeading`, `fontBody`, `borderRadius`, `createdAt`, `updatedAt`

**navigation.schema.ts**
- `navigation_menus`: `id`, `name`, `description`, `isVisible`, `displayLabel`, `showHeading`, `createdAt`, `updatedAt`
- `navigation_items`: `id`, `menuId`, `parentId`, `locale`, `label`, `url`, `icon`, `showIcon`, `sortOrder`, `isActive`, `openInNewTab`, `createdAt`, `updatedAt`

**page.schema.ts**
- `pages`: `id`, `locale`, `slug`, `title`, `metaTitle`, `metaDescription`, `ogImage`, `canonical`, `robots`, `template`, `isPublished`, `publishedAt`, `scheduledAt`, `scheduledUnpublishAt`, `sortOrder`, `deletedAt`, `updatedBy`, `lockedBy`, `lockedAt`, `createdAt`, `updatedAt` _(sections: many)_
- `page_sections`: `id`, `pageId`, `type`, `content`, `sortOrder`, `isVisible`, `createdAt`, `updatedAt`, `updatedBy` _(page: one)_

**page-version.schema.ts**
- `page_versions`: `id`, `pageId`, `versionNumber`, `snapshot`, `createdBy`, `note`, `createdAt` _(page: one, author: one)_

**media.schema.ts**
- `media_folders`: `id`, `organizationId`, `name`, `parentId`, `sortOrder`, `createdAt`, `updatedAt` _(organization: one, parent: one, children: many, files: many)_
- `media_files`: `id`, `organizationId`, `folderId`, `filename`, `url`, `mimeType`, `size`, `width`, `height`, `createdAt`, `updatedAt` _(organization: one, folder: one, alts: many)_
- `media_file_alts`: `id`, `fileId`, `locale`, `alt`, `title` _(file: one)_

**consent.schema.ts**
- `consent_settings`: `id`, `locale`, `title`, `description`, `acceptAll`, `rejectAll`, `customize`, `savePreferences`, `necessaryLabel`, `necessaryDescription`, `analyticsLabel`, `analyticsDescription`, `marketingLabel`, `marketingDescription`, `privacyPolicyLabel`, `privacyPolicyUrl`, `isActive`, `createdAt`, `updatedAt`

**blog.schema.ts**
- `blog_posts`: `id`, `organizationId`, `authorId`, `slug`, `status`, `featuredImageId`, `viewCount`, `isFeatured`, `isSticky`, `commentStatus`, `allowReviews`, `seoScore`, `publishedAt`, `createdAt`, `updatedAt`, `updatedBy`, `lockedBy`, `lockedAt` _(organization: one, author: one, updatedByUser: one, lockedByUser: one, featuredImage: one, translations: many, categories: many, tags: many, comments: many, revisions: many, galleries: many, reviews: many, favorites: many, reactions: many, seo: many, viewStats: many, links: many, linkedTo: many, locks: one)_
- `blog_post_translations`: `id`, `postId`, `organizationId`, `locale`, `title`, `slug`, `content`, `excerpt`, `metaTitle`, `metaDescription`, `metaKeywords`, `canonicalUrl`, `ogTitle`, `ogDescription`, `ogImageId`, `createdAt`, `updatedAt` _(post: one, ogImage: one)_
- `blog_categories`: `id`, `organizationId`, `parentId`, `slug`, `icon`, `color`, `sortOrder`, `createdAt`, `updatedAt` _(organization: one, parent: one, children: many, translations: many, posts: many)_
- `blog_category_translations`: `id`, `categoryId`, `organizationId`, `locale`, `name`, `slug`, `description`, `metaTitle`, `metaDescription`, `createdAt`, `updatedAt` _(category: one)_
- `blog_tags`: `id`, `organizationId`, `slug`, `color`, `createdAt`, `updatedAt` _(organization: one, translations: many, posts: many)_
- `blog_tag_translations`: `id`, `tagId`, `organizationId`, `locale`, `name`, `slug`, `createdAt`, `updatedAt` _(tag: one)_
- `blog_post_categories`: `postId`, `categoryId` _(post: one, category: one)_
- `blog_post_tags`: `postId`, `tagId` _(post: one, tag: one)_
- `blog_comments`: `id`, `postId`, `authorId`, `parentId`, `guestName`, `guestEmail`, `content`, `status`, `karma`, `ipAddress`, `userAgent`, `isEdited`, `createdAt`, `updatedAt` _(post: one, author: one, parent: one, replies: many, moderations: many)_
- `blog_comment_moderations`: `id`, `commentId`, `moderatorId`, `action`, `reason`, `previousValues`, `createdAt` _(comment: one, moderator: one)_
- `blog_post_revisions`: `id`, `postId`, `authorId`, `locale`, `title`, `slug`, `content`, `excerpt`, `status`, `revisionNote`, `createdAt` _(post: one, author: one)_
- `blog_post_galleries`: `id`, `postId`, `title`, `description`, `sortOrder`, `createdAt`, `updatedAt` _(post: one, media: many)_
- `blog_post_gallery_media`: `galleryId`, `mediaId`, `altText`, `caption`, `sortOrder` _(gallery: one, file: one)_
- `blog_post_reviews`: `id`, `postId`, `authorId`, `rating`, `title`, `content`, `status`, `isRecommended`, `helpfulCount`, `ipAddress`, `createdAt`, `updatedAt` _(post: one, author: one, helpfulVotes: many)_
- `blog_post_review_helpful`: `reviewId`, `userId`, `isHelpful`, `createdAt` _(review: one, user: one)_
- `blog_reports`: `id`, `postId`, `commentId`, `reviewId`, `reporterId`, `reason`, `description`, `status`, `resolvedBy`, `resolvedAt`, `createdAt` _(post: one, comment: one, review: one, reporter: one, resolver: one)_
- `blog_post_favorites`: `postId`, `userId`, `createdAt` _(post: one, user: one)_
- `blog_post_reactions`: `postId`, `userId`, `reactionType`, `createdAt`, `updatedAt` _(post: one, user: one)_
- `blog_post_seo`: `id`, `postId`, `locale`, `focusKeyword`, `focusKeywordScore`, `readabilityScore`, `metaRobots`, `metaOgType`, `metaOgLocale`, `metaTwitterCard`, `schemaMarkup`, `createdAt`, `updatedAt` _(post: one)_
- `blog_post_view_stats`: `id`, `postId`, `viewedAt`, `date`, `hour`, `referrer`, `country`, `deviceType`, `sessionId` _(post: one)_
- `blog_notifications`: `id`, `userId`, `organizationId`, `type`, `postId`, `commentId`, `reviewId`, `fromUserId`, `isRead`, `metadata`, `createdAt` _(user: one, organization: one, post: one, comment: one, review: one, fromUser: one)_
- `blog_post_locks`: `id`, `postId`, `userId`, `sessionId`, `lockedAt`, `expiresAt` _(post: one, user: one)_
- `blog_post_links`: `id`, `sourcePostId`, `targetPostId`, `linkType`, `sortOrder`, `createdAt` _(sourcePost: one, targetPost: one)_
- `blog_subscribers`: `id`, `organizationId`, `email`, `locale`, `token`, `tokenUsedAt`, `confirmationTokenHash`, `confirmationTokenExpiresAt`, `confirmationTokenUsedAt`, `unsubscribeTokenHash`, `unsubscribeTokenUsedAt`, `status`, `confirmedAt`, `unsubscribedAt`, `createdAt`, `updatedAt`

**services.schema.ts**
- `services`: `id`, `organizationId`, `providerId`, `slug`, `status`, `coverImageId`, `priceMinor`, `currency`, `durationMinutes`, `maxParticipants`, `isMobile`, `isFeatured`, `viewCount`, `ratingAverage100`, `ratingCount`, `seoScore`, `publishedAt`, `createdAt`, `updatedAt`, `updatedBy`, `lockedBy`, `lockedAt`
- `service_translations`: `id`, `serviceId`, `organizationId`, `locale`, `title`, `slug`, `excerpt`, `content`, `locationLabel`, `locationAddress`, `metaTitle`, `metaDescription`, `metaKeywords`, `canonicalUrl`, `ogTitle`, `ogDescription`, `ogImageId`, `searchVector`, `createdAt`, `updatedAt`
- `service_categories`: `id`, `organizationId`, `parentId`, `slug`, `icon`, `color`, `sortOrder`, `createdAt`, `updatedAt`
- `service_category_translations`: `id`, `categoryId`, `organizationId`, `locale`, `name`, `slug`, `description`, `metaTitle`, `metaDescription`, `createdAt`, `updatedAt`
- `service_tags`: `id`, `organizationId`, `slug`, `color`, `createdAt`, `updatedAt`
- `service_tag_translations`: `id`, `tagId`, `organizationId`, `locale`, `name`, `slug`, `createdAt`, `updatedAt`
- `service_category_links`: `serviceId`, `categoryId`
- `service_tag_links`: `serviceId`, `tagId`
- `service_media`: `serviceId`, `mediaId`, `kind`, `altText`, `caption`, `sortOrder`
- `service_availability`: `id`, `serviceId`, `dayOfWeek`, `startTime`, `endTime`, `timezone`, `maxParticipants`, `createdAt`
- `service_revisions`: `id`
- `service_locks`: `id`
- `service_seo`: `id`
- `service_favorites`: `serviceId`
- `service_comments`: `id`
- `service_reviews`: `id`
- `service_reports`: `id`
- `service_view_stats`: `id`

**services-engagement.schema.ts**
- `service_reactions`: `serviceId`
- `service_notifications`: `id`
- `service_attribute_definitions`: `id`
- `service_attribute_values`: `serviceId`
- `service_review_helpful`: `reviewId`, `userId`, `isHelpful`, `createdAt`

### Migrations

- `0000_plain_old_lace.sql`
- `0001_numerous_ken_ellis.sql`
- `0002_sticky_blazing_skull.sql`
- `0003_brief_senator_kelly.sql`
- `0004_flashy_ezekiel_stane.sql`
- `0005_hard_joseph.sql`
- `0006_services_module.sql`
- `0007_services_search.sql`
- `0007_services_search_vector.sql`
- `0008_services_notification_targets.sql`

### Commands

| Command |
|---------|
| `pnpm db:check` |
| `pnpm db:compare` |
| `pnpm db:generate` |
| `pnpm db:infra` |
| `pnpm db:migrate` |
| `pnpm db:reset` |
| `pnpm db:seed` |
| `pnpm db:seed-media` |
| `pnpm db:sync` |
| `pnpm db:cleanup-audit` |

### Tests

- `tests/integration/db-health.test.ts`
- `tests/unit/cache.test.ts`
- `tests/unit/cli-utils.test.ts`
- `tests/unit/cms-schemas.test.ts`
- `tests/unit/cms-seeds.test.ts`
- `tests/unit/db-env.test.ts`
- `tests/unit/loaders.test.ts`
- `tests/unit/navigation-loader.test.ts`
- `tests/unit/schema-validation.test.ts`
- `tests/unit/search-fts.test.ts`
- `tests/unit/site-loader.test.ts`

## Authentication

### Files

```
src/lib/ (auth)
  audit.ts
  auth-client.ts
  auth-data.ts
  auth-guards.ts
  auth.ts
  permissions.ts
  rate-limit.ts
  sanitize.ts
src/actions/
  admin/
  blog/
  index.ts
  org/
  services/
src/middleware.ts
```

### Authentication Flows

- Sign up (username + email + password)
- Email login
- Email verification
- Password reset
- Account deletion (GDPR)
- Admin impersonation

### Roles & Organizations

- **user** — standard access
- **admin** — full access + impersonation
- Organizations: creation, invitations, members, custom roles

### Security & Audit

- Automatic audit trail on all sensitive actions
- In-memory rate limiting
- Input sanitization
- Guards on protected routes
- `middleware.ts` injects auth session on every request

### Tests

- `tests/e2e/auth.spec.ts`
- `tests/integration/audit.test.ts`
- `tests/integration/auth-advanced.test.ts`
- `tests/integration/auth-flow.test.ts`
- `tests/integration/auth-org.test.ts`
- `tests/integration/auth.test.ts`
- `tests/integration/middleware.test.ts`
- `tests/unit/audit-fallback.test.ts`
- `tests/unit/auth-guards.test.ts`
- `tests/unit/cms-audit.test.ts`
- `tests/unit/extract-ip.test.ts`
- `tests/unit/mask-utils.test.ts`
- `tests/unit/middleware-timeout.test.ts`
- `tests/unit/permissions.test.ts`
- `tests/unit/production-hardening.test.ts`
- `tests/unit/rate-limit.test.ts`

## Content & CMS

### Files

```
src/core/
admin/
  confirmation.ts
  filter-contract.ts
  index.ts
  resource-contract.ts
attributes/
  index.ts
audit/
  index.ts
cache/
  index.ts
capabilities/
  index.ts
content/
  index.ts
  text.ts
engagement/
  index.ts
index.ts
localization/
  index.ts
  module-labels.ts
locks/
  index.ts
media/
  index.ts
moderation/
  index.ts
modules/
  bootstrap.ts
  index.ts
  module-contract.ts
  module-registry.ts
notifications/
  index.ts
presentation/
  index.ts
revision/
  index.ts
search/
  contract.ts
  index.ts
  postgres.ts
  registry.ts
seo/
  index.ts
taxonomy/
  index.ts
workflow/
  index.ts
src/modules/
blog/
  actions/
    index.ts
  admin/
    index.ts
    resource.ts
  capabilities.ts
  components/
    cards/
      index.ts
    lists/
      index.ts
    single/
      index.ts
    ui/
      index.ts
  domain/
    index.ts
  i18n/
    index.ts
  index.ts
  loaders/
    index.ts
  module.ts
  permissions/
    index.ts
  schema/
    index.ts
  search/
    index.ts
  seo/
    index.ts
  utils/
    index.ts
  validation/
    index.ts
services/
  actions/
    index.ts
  admin/
    index.ts
    loader.ts
    resource.ts
  capabilities.ts
  components/
    cards/
      index.ts
      ServiceCard.astro
    lists/
      index.ts
      ServiceGrid.astro
    single/
      index.ts
      ServiceDetail.astro
      ServiceEngagement.astro
    ui/
      index.ts
      ServiceLocaleSwitcher.astro
      ServiceMeta.astro
  domain/
    index.ts
  i18n/
    engagement.ts
    form.ts
    index.ts
    notifications.ts
    sort.ts
  index.ts
  loaders/
    index.ts
  module.ts
  permissions/
    index.ts
  schema/
    index.ts
  search/
    index.ts
  seo/
    index.ts
  utils/
    index.ts
    urls.ts
  validation/
    index.ts
  workflow.ts
src/pages/
404.astro
500.astro
api/
  audit-export.ts
  auth/
    [...all].ts
  blog/
    newsletter/
  contact.ts
  content-export.ts
  content-import.ts
  cron/
    publish.ts
  export-data.ts
  health.ts
  media.ts
  preview.ts
  search.ts
  upload.ts
index.astro
robots.txt.ts
rss.xml.ts
sitemap-blog-org.xml.ts
sitemap-cms.xml.ts
sitemap-services-org.xml.ts
[lang]/
  a-propos.astro
  admin/
    audit.astro
    blog/
    index.astro
    media.astro
    navigation.astro
    organizations.astro
    pages.astro
    roles.astro
    services/
    site.astro
    stats.astro
    theme.astro
    users.astro
  auth/
    [slug].astro
  blog/
    index.astro
    [...slug].astro
  contact.astro
  index.astro
  organizations/
    [slug]/
  services/
    index.astro
    tags/
    [categorySlug]/
    [categorySlug].astro
    [slug].astro
  [slug].astro
src/layouts/
BaseLayout.astro
```

Atomic CMS is organized around shared CMS/platform capabilities and first-class domain modules. The foundation covers localised content, shared media, taxonomy, SEO, search, publication workflow, revisions, locks, engagement/moderation boundaries, notifications, audit, cache and the reusable Admin Resource model. Blog is the first complete editorial module; Services is the second validation module. Transactional domains such as booking, enrollment, inventory, payments and orders remain separate cores.

### Tests

- `tests/e2e/blog.spec.ts`
- `tests/e2e/cms-admin.spec.ts`
- `tests/e2e/services-lifecycle.spec.ts`
- `tests/e2e/services.spec.ts`
- `tests/integration/blog-actions.test.ts`
- `tests/integration/blog-internal-link.test.ts`
- `tests/integration/cms-admin.test.ts`
- `tests/integration/consent-cms.test.ts`
- `tests/integration/contact-api.test.ts`
- `tests/integration/legal-cms.test.ts`
- `tests/integration/navigation-cycle.test.ts`
- `tests/unit/admin-consent.test.ts`
- `tests/unit/admin-contact.test.ts`
- `tests/unit/admin-helpers.test.ts`
- `tests/unit/admin-hours.test.ts`
- `tests/unit/admin-menus.test.ts`
- `tests/unit/admin-navigation-items.test.ts`
- `tests/unit/admin-pages-theme.test.ts`
- `tests/unit/admin-pages.test.ts`
- `tests/unit/admin-roles.test.ts`
- `tests/unit/admin-sections.test.ts`
- `tests/unit/admin-site-social-contact-hours.test.ts`
- `tests/unit/admin-site.test.ts`
- `tests/unit/admin-social.test.ts`
- `tests/unit/admin-theme.test.ts`
- `tests/unit/admin-versions.test.ts`
- `tests/unit/blog-engagement-actions.test.ts`
- `tests/unit/blog-gallery.test.ts`
- `tests/unit/blog-helpers.test.ts`
- `tests/unit/blog-lifecycle.test.ts`
- `tests/unit/blog-link.test.ts`
- `tests/unit/blog-loader.test.ts`
- `tests/unit/blog-newsletter-routes.test.ts`
- `tests/unit/blog-newsletter-service.test.ts`
- `tests/unit/blog-post-actions.test.ts`
- `tests/unit/blog-profile.test.ts`
- `tests/unit/blog-public-visibility.test.ts`
- `tests/unit/blog-subscription.test.ts`
- `tests/unit/blog-taxonomy-actions.test.ts`
- `tests/unit/blog-validation.test.ts`
- `tests/unit/contact-api.test.ts`
- `tests/unit/content-import-schema.test.ts`
- `tests/unit/content-locking.test.ts`
- `tests/unit/database/services-data-invariants.test.ts`
- `tests/unit/database/services-data-shape.test.ts`
- `tests/unit/export-data.test.ts`
- `tests/unit/media-loader.test.ts`
- `tests/unit/navigation-menus.test.ts`
- `tests/unit/navigation-tree.test.ts`
- `tests/unit/services-contract.test.ts`
- `tests/unit/services-validation.test.ts`
- `tests/unit/services-workflow-restore.test.ts`

## Media

### Files

```
src/media/
delete.ts
list.ts
types.ts
upload.ts
public/
favicon.ico
favicon.svg
uploads/
  images/
  media/
```

### Upload & Processing

- Secure upload with MIME type and size validation
- Image processing with **sharp** (resize, optimisation)
- Storage in `public/uploads/`
- Delete and list uploaded files

### Commands

| Command |
|---------|
| `pnpm db:seed-media` |

### Tests

- `tests/unit/admin-media.test.ts`
- `tests/unit/media-list.test.ts`
- `tests/unit/upload-api.test.ts`
- `tests/unit/upload.test.ts`

## Email & Notifications

### Files

```
src/smtp/
commands/
  logs.rotate.ts
  smtp.check.ts
  _utils.ts
env.ts
providers/
  brevo.ts
  nodemailer.ts
  resend.ts
send.ts
templates/
  blog-newsletter.ts
  contact-form.ts
  delete-account.ts
  i18n.ts
  layout.ts
  organization-invitation.ts
  reset-password.ts
  verify-email.ts
types.ts
logs/ ← email dead-letter queue (JSONL, one file per day)
```

### Providers

- **Brevo** (`SMTP_PROVIDER=BREVO`)
- **Resend** (`SMTP_PROVIDER=RESEND`)
- **Nodemailer** (`SMTP_PROVIDER=NODEMAILER`) — standard SMTP

Provider selected via `SMTP_PROVIDER` environment variable.

### Templates

i18n email templates for: email verification, password reset, organisation invitations.

### Commands

| Command |
|---------|
| `pnpm smtp:check` |
| `pnpm logs:rotate` |

### Tests

- `tests/unit/contact-form-template.test.ts`
- `tests/unit/send-email.test.ts`
- `tests/unit/smtp-env.test.ts`
- `tests/unit/smtp-providers.test.ts`

## Internationalisation

### Files

```
src/i18n/
ar/
  about.ts
  auth.ts
  common.ts
  contact.ts
  home.ts
blog/
  ar.ts
  en.ts
  es.ts
  fr.ts
config.ts
en/
  about.ts
  auth.ts
  common.ts
  contact.ts
  home.ts
es/
  about.ts
  auth.ts
  common.ts
  contact.ts
  home.ts
fr/
  about.ts
  auth.ts
  common.ts
  contact.ts
  home.ts
utils.ts
```

### Supported Locales

| Locale | Language | Direction |
|--------|----------|-----------|
| `fr` | Français (default) | LTR |
| `en` | English | LTR |
| `es` | Español | LTR |
| `ar` | العربية | RTL |

### Routing

All routes are prefixed with the locale: `/fr/`, `/en/`, `/es/`, `/ar/`. Default locale is `fr`.

### Tests

- `tests/unit/cms-i18n.test.ts`
- `tests/unit/i18n-key-completeness.test.ts`
- `tests/unit/i18n-translations.test.ts`
- `tests/unit/i18n-urls.test.ts`
- `tests/unit/i18n-utils.test.ts`

## CI/CD & Quality

### Files

```
tests/
  a11y/
  e2e/
  helpers/
  integration/
  unit/
.github/
agents/
  akil.agent.md
  anne.agent.md
  AtomicFullStackEngineer.agent.md
  AtomicUIDesigner.agent.md
  designer.agent.md
  DevOpsExpert.agent.md
  elias.agent.md
  faqir.md
  fatima.agent.md
  hawa.agent.md
  ishaq.agent.md
  leila.agent.md
  liwei.agent.md
  maya.agent.md
  moonzam.agent.md
  orchestrator.agent.md
  ourssoum.agent.md
  planner.agent.md
  soren.agent.md
  vladimir.agent.md
  yusra.agent.md
dependabot.yml
prompts/
skills/
  accessibility/
    references/
      A11Y-PATTERNS.md
      WCAG.md
    SKILL.md
  astro/
    SKILL.md
  best-practices/
    SKILL.md
  drizzle/
    metadata.json
    references/
      advanced-schemas.md
      performance.md
      query-patterns.md
      vs-prisma.md
    SKILL.md
  emailAndPassword/
    SKILL.md
  frontend-design/
    LICENSE.txt
    SKILL.md
  nodejs-backend-patterns/
    references/
      advanced-patterns.md
    SKILL.md
  nodejs-best-practices/
    SKILL.md
  organization/
    SKILL.md
  playwright-best-practices/
    advanced/
      authentication-flows.md
      authentication.md
      clock-mocking.md
      mobile-testing.md
      multi-context.md
      multi-user.md
      network-advanced.md
      third-party.md
    architecture/
      pom-vs-fixtures.md
      test-architecture.md
      when-to-mock.md
    browser-apis/
      browser-apis.md
      iframes.md
      service-workers.md
      websockets.md
    core/
      annotations.md
      assertions-waiting.md
      configuration.md
      fixtures-hooks.md
      global-setup.md
      locators.md
      page-object-model.md
      projects-dependencies.md
      test-data.md
      test-suite-structure.md
      test-tags.md
    debugging/
      console-errors.md
      debugging.md
      error-testing.md
      flaky-tests.md
    frameworks/
      angular.md
      nextjs.md
      react.md
      vue.md
    infrastructure-ci-cd/
      ci-cd.md
      docker.md
      github-actions.md
      gitlab.md
      other-providers.md
      parallel-sharding.md
      performance.md
      reporting.md
      test-coverage.md
    LICENSE.md
    README.md
    SKILL.md
    testing-patterns/
      accessibility.md
      api-testing.md
      browser-extensions.md
      canvas-webgl.md
      component-testing.md
      drag-drop.md
      electron.md
      file-operations.md
      file-upload-download.md
      forms-validation.md
      graphql-testing.md
      i18n.md
      performance-testing.md
      security-testing.md
      visual-regression.md
  seo/
    SKILL.md
  shadcn/
    agents/
      openai.yml
    assets/
      shadcn-small.png
      shadcn.png
    cli.md
    customization.md
    evals/
      evals.json
    mcp.md
    rules/
      base-vs-radix.md
      composition.md
      forms.md
      icons.md
      styling.md
    SKILL.md
  tailwind-css-patterns/
    references/
      accessibility.md
      animations.md
      component-patterns.md
      configuration.md
      layout-patterns.md
      performance.md
      reference.md
      responsive-design.md
    SKILL.md
  tailwind-v4-shadcn/
    references/
      advanced-usage.md
      common-gotchas.md
      dark-mode.md
      migration-guide.md
      plugins-reference.md
    SKILL.md
    templates/
      components.json
      index.css
      theme-provider.tsx
      tsconfig.app.json
      utils.ts
      vite.config.ts
  twoFactor/
    SKILL.md
  typescript-advanced-types/
    SKILL.md
  vitest/
    GENERATION.md
    references/
      advanced-environments.md
      advanced-projects.md
      advanced-type-testing.md
      advanced-vi.md
      core-cli.md
      core-config.md
      core-describe.md
      core-expect.md
      core-hooks.md
      core-test-api.md
      features-concurrency.md
      features-context.md
      features-coverage.md
      features-filtering.md
      features-mocking.md
      features-snapshots.md
    SKILL.md
workflows/
  ci.yml
  codeql.yml
```

### CI/CD Pipeline

GitHub Actions pipeline on every push/PR to `main`:

1. **Lint & Type Check** — ESLint + `astro check` + `pnpm audit`
2. **Unit & Integration** — Vitest + coverage (PostgreSQL 16)
3. **E2E** — Playwright (Chromium + Firefox + WebKit)
4. **Accessibility & Performance** — Pa11y + Lighthouse CI
5. **Build** — production artefact on `main`

### Accessibility & Performance

- **Pa11y** — WCAG AAA compliance
- **Lighthouse CI** — performance, accessibility, best practices, SEO

### Commands

| Command |
|---------|
| `pnpm lint` |
| `pnpm lint:fix` |
| `pnpm check` |
| `pnpm test` |
| `pnpm test:watch` |
| `pnpm test:report` |
| `pnpm test:e2e` |
| `pnpm test:e2e:ui` |
| `pnpm test:e2e:report` |
| `pnpm qa:report` |
| `pnpm a11y:setup` |
| `pnpm a11y:teardown` |
| `pnpm a11y:pa11y` |
| `pnpm a11y:lighthouse` |
| `pnpm a11y:lighthouse:authed` |
| `pnpm a11y:lighthouse:rename` |
| `pnpm a11y:lighthouse:report` |
| `pnpm a11y:lighthouse:report:contrast` |
| `pnpm a11y:report` |
| `pnpm a11y` |
| `pnpm a11y:pa11y-only` |
| `pnpm a11y:lighthouse-only` |
| `pnpm qa` |
| `pnpm qa:offline` |

