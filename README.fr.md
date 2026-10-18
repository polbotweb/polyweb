# Atomic

[EN](./README.md) | [**FR**](./README.fr.md) | [AR](./README.ar.md) | [ES](./README.es.md)

Application web SSR full-stack — authentification, organisations, CMS, médias, SMTP et i18n sur 4 locales.

_Ce README est généré automatiquement pour fournir un contexte complet à l'IA._

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Démarrage](#démarrage)
- [Système de design](#système-de-design)
- [Base de données](#base-de-données)
- [Authentification](#authentification)
- [Contenu et CMS](#contenu-et-cms)
- [Médias](#médias)
- [Email et notifications](#email-et-notifications)
- [Internationalisation](#internationalisation)
- [CI/CD et qualité](#cicd-et-qualité)

## Vue d'ensemble

Application web SSR multi-langue avec authentification complète, gestion d'organisations, CMS, médias et audit trail.

- ⚡ **Astro 6** (SSR, `@astrojs/node`) — Rendu côté serveur, Tailwind CSS 4, TypeScript
- 🔐 **better-auth** — Email/mot de passe, vérification email, organisations, rôles, impersonation admin
- 🗄️ **Drizzle ORM** + **PostgreSQL 16** — Migrations type-safe, loaders, recherche plein texte
- 🎨 **Starwind** — 47+ composants UI Astro accessibles
- 🌍 **i18n** — fr, en, es, ar (RTL) avec routes localisées
- 📋 **CMS** — Pages, sections JSON typées, navigation, scheduling, versioning, import/export
- 📁 **Médias** — Upload, traitement Sharp, organisation en dossiers
- 📧 **SMTP** — Brevo / Resend / Nodemailer + file morte de mails
- 🛡️ **Sécurité** — Audit trail, rate limiting, sanitization des inputs
- ✅ **Tests** — 741 Vitest + 34 scénarios E2E Playwright × 3 navigateurs

### Stack technique

| Technologie | Rôle |
|:--|:--|
| **Astro 6** (`@astrojs/node`) | Framework SSR |
| **better-auth** | Auth, organisations, sessions |
| **Drizzle ORM** + **PostgreSQL 16** | Base de données |
| **Tailwind CSS 4** + **Starwind** | Design system (47+ composants) |
| **Vitest** + **Playwright** | Tests unitaires, intégration & E2E |
| **GitHub Actions** | CI/CD |

## Démarrage

### Prérequis

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

### Variables d'environnement

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
| `SITE_NAME` | ═════════════════════════ Polyweb — plateforme CMS ═════════════════════════ |
| `POLYWEB_SIGNING_SECRET` | Obligatoire en production (sinon BETTER_AUTH_SECRET est utilisé). |
| `CRON_SECRET` | Secret des routes /api/cron/* (en-tête Authorization: Bearer …) |
| `ASTRO_ADAPTER` | Adaptateur Astro ( node | vercel ) |
| `STORAGE_DRIVER` | Stockage des médias (brique e) : local | s3 | r2 |
| `SEARCH_DRIVER` | Recherche (brique k) : postgres | meilisearch | pagefind |
| `PAYMENTS_ENABLED` | Paiements (module optionnel) |

### Alias TypeScript

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

## Système de design

### Fichiers

```
src/components/
admin/
  ForceReleaseLockButton.astro
  MarkdownEditor.astro
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
auth/
  SecuritySettings.astro
  SignInAlternatives.astro
blocks/
  BlockEditor.astro
  BlockRenderer.astro
blog/
  AdminModerationQueue.astro
  AdminPostForm.astro
  AdminPostList.astro
  AdminTaxonomyManager.astro
  ArticleProgressBar.astro
  AuthorCard.astro
  BlogAdminPage.astro
  CategoryFilterBar.astro
  CommentForm.astro
  CommentSection.astro
  CommentThreadItem.astro
  NotificationBell.astro
  PostCard.astro
  PostContent.astro
  PostGridToggle.astro
  ReactionBar.astro
  ReviewForm.astro
  ReviewSection.astro
  ShareBar.astro
  TagCloud.astro
  cards/
  comments/
  grids/
  sidebars/
content/
  ContentEditor.astro
  RichContent.astro
forms/
  PolywebForm.astro
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
  PlatformAdmin/
  Testimonials/
pages/
  AboutPage/
  CmsPage.astro
  ContactPage/
  HomePage/
  LegalPage.astro
  admin/
  auth/
  blog/
  cms/
  org/
platform/
  EntryView.astro
  FieldInput.astro
  FieldsEditor.astro
seo/
  JsonLd.astro
  SEOHead.astro
services/
  AdminServiceForm.astro
  AdminServiceList.astro
  ServicesAdminPage.astro
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

### Composants

- **atoms/** — 48 components
- **molecules/** — 3 components
- **organisms/** — 13 components
- **pages/** — 10 components
- **wow/** — 9 components

### Styles et tokens

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
- `tests/unit/seo-meta.test.ts`
- `tests/unit/seo.test.ts`
- `tests/unit/theme-tokens.test.ts`

## Base de données

### Fichiers

```
src/database/
cache.ts
commands/
  _effect.ts
  _migration-sql.ts
  _utils.ts
  db.backfill-variants.ts
  db.backup.ts
  db.baseline.ts
  db.check.ts
  db.clean-media.ts
  db.cleanup-audit.ts
  db.compare.ts
  db.create-admin.ts
  db.generate.ts
  db.infra.ts
  db.migrate.ts
  db.reset.ts
  db.restore.ts
  db.seed-media.ts
  db.seed.ts
  db.sync.ts
  db.wait.ts
  search.pagefind.ts
  search.reindex.ts
  storage.push.ts
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
  effect.ts
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
  0007_services_search_vector.sql
  0008_services_notification_targets.sql
  0009_better_auth_account_issuer.sql
  0010_media_variants.sql
  0011_payments.sql
  0012_auth_2fa_passkey.sql
  0013_content_platform.sql
  0014_api_tokens.sql
  0015_webhooks.sql
  0016_forms.sql
  0017_plugins.sql
  0018_search_documents.sql
  0019_page_locks.sql
  0020_drop_pages_legacy_lock.sql
  meta/
    0000_snapshot.json
    0001_snapshot.json
    0002_snapshot.json
    0003_snapshot.json
    0004_snapshot.json
    0005_snapshot.json
    0010_snapshot.json
    0011_snapshot.json
    0012_snapshot.json
    0013_snapshot.json
    0014_snapshot.json
    0015_snapshot.json
    0016_snapshot.json
    0017_snapshot.json
    0018_snapshot.json
    0019_snapshot.json
    0020_snapshot.json
    _journal.json
schemas/
  api.schema.ts
  audit-log.schema.ts
  auth.schema.ts
  blog.schema.ts
  consent.schema.ts
  content.schema.ts
  forms.schema.ts
  media.schema.ts
  navigation.schema.ts
  page-version.schema.ts
  page.schema.ts
  payments.schema.ts
  plugins.schema.ts
  search.schema.ts
  services-engagement.schema.ts
  services.schema.ts
  site.schema.ts
  webhooks.schema.ts
schemas.ts
```

### Schémas et tables

**auth.schema.ts**
- `user`: `id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt`, `username`, `displayUsername`, `bio`, `website`, `twitter`, `linkedin`, `role`, `banned`, `banReason`, `banExpires`, `twoFactorEnabled` _(sessions: many, accounts: many, members: many, invitations: many)_
- `session`: `id`, `expiresAt`, `token`, `createdAt`, `updatedAt`, `ipAddress`, `userAgent`, `userId`, `impersonatedBy`, `activeOrganizationId` _(user: one)_
- `account`: `id`, `issuer`, `accountId`, `providerId`, `userId`, `accessToken`, `refreshToken`, `idToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `password`, `createdAt`, `updatedAt` _(user: one)_
- `verification`: `id`, `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`
- `organization`: `id`, `name`, `slug`, `logo`, `createdAt`, `updatedAt`, `metadata` _(organizationRoles: many, members: many, invitations: many)_
- `member`: `id`, `organizationId`, `userId`, `role`, `createdAt` _(organization: one, user: one)_
- `invitation`: `id`, `organizationId`, `email`, `role`, `status`, `expiresAt`, `createdAt`, `inviterId` _(organization: one, user: one)_
- `organization_role`: `id`, `organizationId`, `role`, `permission`, `createdAt`, `updatedAt` _(organization: one)_
- `two_factor`: `id`, `secret`, `backupCodes`, `userId`, `verified`, `failedVerificationCount`, `lockedUntil` _(user: one)_
- `passkey`: `id`, `name`, `publicKey`, `userId`, `credentialID`, `counter`, `deviceType`, `backedUp`, `transports`, `createdAt`, `aaguid` _(user: one)_

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
- `pages`: `id`, `locale`, `slug`, `title`, `metaTitle`, `metaDescription`, `ogImage`, `canonical`, `robots`, `template`, `isPublished`, `publishedAt`, `scheduledAt`, `scheduledUnpublishAt`, `sortOrder`, `deletedAt`, `updatedBy`, `createdAt`, `updatedAt` _(sections: many)_
- `page_sections`: `id`, `pageId`, `type`, `content`, `sortOrder`, `isVisible`, `createdAt`, `updatedAt`, `updatedBy` _(page: one)_
- `page_locks`: `id`, `pageId`, `userId`, `sessionId`, `lockedAt`, `expiresAt`

**page-version.schema.ts**
- `page_versions`: `id`, `pageId`, `versionNumber`, `snapshot`, `createdBy`, `note`, `createdAt` _(page: one, author: one)_

**media.schema.ts**
- `media_folders`: `id`, `organizationId`, `name`, `parentId`, `sortOrder`, `createdAt`, `updatedAt` _(organization: one, parent: one, children: many, files: many)_
- `media_files`: `id`, `organizationId`, `folderId`, `filename`, `url`, `mimeType`, `size`, `width`, `height`, `variants`, `createdAt`, `updatedAt` _(organization: one, folder: one, alts: many)_
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

**payments.schema.ts**
- `payments`: `id`, `organizationId`, `reference`, `description`, `provider`, `providerSessionId`, `providerPaymentId`, `status`, `amount`, `currency`, `customerEmail`, `idempotencyKey`, `metadata`, `createdAt`, `updatedAt`, `paidAt`, `failedAt`

**content.schema.ts**
- `sites`: `id`, `slug`, `name`, `domains`, `defaultLocale`, `locales`, `organizationId`, `isDefault`, `settings`, `createdAt`, `updatedAt`
- `content_types`: `id`, `siteId`, `slug`, `name`, `description`, `fields`, `settings`, `createdAt`, `updatedAt`
- `content_entries`: `id`, `siteId`, `typeId`, `slug`, `status`, `sharedData`, `publishedAt`, `authorId`, `version`, `createdAt`, `updatedAt`
- `content_entry_translations`: `id`, `entryId`, `locale`, `title`, `data`, `blocks`, `seo`, `updatedAt`
- `content_entry_revisions`: `id`, `entryId`, `version`, `snapshot`, `message`, `authorId`, `createdAt`

**api.schema.ts**
- `api_tokens`: `id`, `siteId`, `name`, `prefix`, `tokenHash`, `scopes`, `createdBy`, `lastUsedAt`, `expiresAt`, `revokedAt`, `createdAt`

**webhooks.schema.ts**
- `webhooks`: `id`, `siteId`, `name`, `url`, `secretEncrypted`, `events`, `active`, `consecutiveFailures`, `disabledReason`, `createdBy`, `createdAt`, `updatedAt`
- `webhook_deliveries`: `id`, `webhookId`, `eventId`, `event`, `payload`, `status`, `attempts`, `nextAttemptAt`, `lockedUntil`, `lastStatusCode`, `lastError`, `responseSnippet`, `durationMs`, `createdAt`, `deliveredAt`

**forms.schema.ts**
- `forms`: `id`, `siteId`, `slug`, `name`, `description`, `fields`, `settings`, `status`, `createdAt`, `updatedAt`
- `form_submissions`: `id`, `formId`, `data`, `locale`, `ipHash`, `userAgent`, `status`, `createdAt`

**plugins.schema.ts**
- `plugin_states`: `pluginId`, `enabled`, `settings`, `lastError`, `updatedBy`, `updatedAt`

**search.schema.ts**
- `search_documents`: `id`, `siteId`, `kind`, `type`, `entityId`, `locale`, `title`, `excerpt`, `body`, `url`, `publishedAt`, `tsv`, `updatedAt`

### Migrations

- `0000_plain_old_lace.sql`
- `0001_numerous_ken_ellis.sql`
- `0002_sticky_blazing_skull.sql`
- `0003_brief_senator_kelly.sql`
- `0004_flashy_ezekiel_stane.sql`
- `0005_hard_joseph.sql`
- `0006_services_module.sql`
- `0007_services_search_vector.sql`
- `0008_services_notification_targets.sql`
- `0009_better_auth_account_issuer.sql`
- `0010_media_variants.sql`
- `0011_payments.sql`
- `0012_auth_2fa_passkey.sql`
- `0013_content_platform.sql`
- `0014_api_tokens.sql`
- `0015_webhooks.sql`
- `0016_forms.sql`
- `0017_plugins.sql`
- `0018_search_documents.sql`
- `0019_page_locks.sql`
- `0020_drop_pages_legacy_lock.sql`

### Commandes

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
| `pnpm db:backfill-variants` |
| `pnpm db:wait` |
| `pnpm db:baseline` |
| `pnpm db:backup` |
| `pnpm db:restore` |

### Tests

- `tests/integration/db-health.test.ts`
- `tests/unit/cache.test.ts`
- `tests/unit/cli-utils.test.ts`
- `tests/unit/cms-schemas.test.ts`
- `tests/unit/cms-seeds.test.ts`
- `tests/unit/db-env.test.ts`
- `tests/unit/loaders-effect.test.ts`
- `tests/unit/loaders.test.ts`
- `tests/unit/navigation-loader.test.ts`
- `tests/unit/schema-validation.test.ts`
- `tests/unit/search-fts.test.ts`
- `tests/unit/site-loader.test.ts`

## Authentification

### Fichiers

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

### Flux d'authentification

- Inscription (username + email + mot de passe)
- Connexion par email
- Vérification d'email
- Réinitialisation de mot de passe
- Suppression de compte (RGPD)
- Impersonation admin

### Rôles et organisations

- **user** — accès standard
- **admin** — accès complet + impersonation
- Organisations : création, invitations, membres, rôles personnalisés

### Sécurité et audit

- Audit trail automatique sur toutes les actions sensibles
- Rate limiting in-memory
- Sanitization des inputs
- Guards sur les routes protégées
- `middleware.ts` injecte la session auth sur chaque requête

### Tests

- `tests/e2e/auth.spec.ts`
- `tests/integration/audit.test.ts`
- `tests/integration/auth-advanced.test.ts`
- `tests/integration/auth-extensions.test.ts`
- `tests/integration/auth-flow.test.ts`
- `tests/integration/auth-org.test.ts`
- `tests/integration/auth-plugins.test.ts`
- `tests/integration/auth.test.ts`
- `tests/integration/middleware.test.ts`
- `tests/unit/audit-fallback.test.ts`
- `tests/unit/auth-guards.test.ts`
- `tests/unit/auth-providers.test.ts`
- `tests/unit/cms-audit.test.ts`
- `tests/unit/extract-ip.test.ts`
- `tests/unit/mask-utils.test.ts`
- `tests/unit/middleware-timeout.test.ts`
- `tests/unit/permissions.test.ts`
- `tests/unit/production-hardening.test.ts`
- `tests/unit/rate-limit.test.ts`

## Contenu et CMS

### Fichiers

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
blocks/
  index.ts
  registry.ts
  tiptap-html.ts
cache/
  index.ts
capabilities/
  index.ts
content/
  index.ts
  text.ts
content-types/
  fields.ts
crud/
  contract.ts
  engine.ts
  introspect.ts
engagement/
  index.ts
events/
  index.ts
index.ts
localization/
  index.ts
  module-labels.ts
  platform-labels.ts
locks/
  errors.ts
  index.ts
  policy.ts
  service.ts
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
permissions/
  tenant.ts
plugins/
  contract.ts
  host.ts
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
api/
  domain/
    openapi.ts
    tokens.ts
    v1.ts
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
  locks.ts
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
content/
  domain/
    content-types.ts
    content.effect.ts
    entries.ts
    preview.ts
    revisions.ts
  module.ts
forms/
  domain/
    forms.ts
payments/
  domain/
    payment-service.ts
    providers.ts
    transitions.ts
  index.ts
  module.ts
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
      ServiceCard.astro
      index.ts
    lists/
      ServiceGrid.astro
      ServicesListingPage.astro
      index.ts
    single/
      ServiceDetail.astro
      ServiceEngagement.astro
      index.ts
    ui/
      ServiceLocaleSwitcher.astro
      ServiceMeta.astro
      index.ts
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
  locks.ts
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
sites/
  domain/
    sites.effect.ts
    sites.ts
webhooks/
  domain/
    dispatcher.ts
    http.ts
    signing.ts
    ssrf.ts
    webhooks.ts
  subscribe.ts
src/pages/
404.astro
500.astro
[lang]/
  [organization]/
    admin/
    blog/
    services/
  [slug].astro
  a-propos.astro
  admin/
    audit.astro
    blog/
    index.astro
    media.astro
    navigation.astro
    organizations.astro
    pages.astro
    platform/
    roles.astro
    services/
    site.astro
    stats.astro
    theme.astro
    users.astro
  auth/
    [slug].astro
  blog/
    [category]/
    author/
    index.astro
    tag/
  c/
    [type]/
  contact.astro
  f/
    [slug].astro
  index.astro
  organizations/
    [slug]/
  preview/
    [token].astro
  services/
    [slug].astro
    category/
    index.astro
api/
  admin/
    forms/
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
    search-reindex.ts
    webhooks.ts
  crud/
    [...path].ts
  export-data.ts
  forms/
    [slug].ts
  health.ts
  media.ts
  payments/
    webhook.ts
  preview.ts
  search.ts
  upload.ts
  v1/
    content/
    content-types.ts
    forms/
    index.ts
    openapi.json.ts
    search.ts
index.astro
robots.txt.ts
rss.xml.ts
sitemap-blog-org.xml.ts
sitemap-cms.xml.ts
sitemap-services-org.xml.ts
theme.css.ts
src/layouts/
BaseLayout.astro
```

Atomic CMS est organisé autour de capacités CMS/plateforme partagées et de modules métier de premier rang. Le socle couvre le contenu localisé, les médias partagés, la taxonomie, le SEO, la recherche, le workflow de publication, les révisions, les verrous, les frontières d'engagement/modération, les notifications, l'audit, le cache et le modèle Admin Resource réutilisable. Le Blog est le premier module éditorial complet ; Services est le deuxième module de validation. Les domaines transactionnels comme la réservation, l'inscription, le stock, le paiement et les commandes restent des cœurs séparés.

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
- `tests/integration/loaders/blog-loader-effect.test.ts`
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

## Médias

### Fichiers

```
src/media/
delete.ts
list.ts
types.ts
upload.ts
variants.ts
public/
favicon.ico
favicon.svg
uploads/
  images/
```

### Upload et traitement

- Upload sécurisé avec validation du type MIME et de la taille
- Traitement des images avec **sharp** (resize, optimisation)
- Stockage dans `public/uploads/`
- Suppression et liste des fichiers uploadés

### Commandes

| Command |
|---------|
| `pnpm db:seed-media` |

### Tests

- `tests/unit/admin-media.test.ts`
- `tests/unit/media-list.test.ts`
- `tests/unit/upload-api.test.ts`
- `tests/unit/upload.test.ts`

## Email et notifications

### Fichiers

```
src/smtp/
commands/
  _utils.ts
  logs.rotate.ts
  smtp.check.ts
env.ts
mailer.ts
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
  sign-in-otp.ts
  verify-email.ts
types.ts
logs/ ← email dead-letter queue (JSONL, one file per day)
```

### Fournisseurs

- **Brevo** (`SMTP_PROVIDER=BREVO`)
- **Resend** (`SMTP_PROVIDER=RESEND`)
- **Nodemailer** (`SMTP_PROVIDER=NODEMAILER`) — SMTP standard

Le provider est sélectionné via la variable d'environnement `SMTP_PROVIDER`.

### Modèles

Templates d'email i18n pour : vérification d'email, réinitialisation de mot de passe, invitations organisations.

### Commandes

| Command |
|---------|
| `pnpm smtp:check` |
| `pnpm logs:rotate` |

### Tests

- `tests/unit/contact-form-template.test.ts`
- `tests/unit/send-email.test.ts`
- `tests/unit/smtp-env.test.ts`
- `tests/unit/smtp-providers.test.ts`
- `tests/unit/smtp-send-effect.test.ts`

## Internationalisation

### Fichiers

```
src/i18n/
ar/
  about.ts
  auth.ts
  common.ts
  contact.ts
  home.ts
auth-extensions.ts
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

### Locales supportées

| Locale | Language | Direction |
|--------|----------|-----------|
| `fr` | Français (default) | LTR |
| `en` | English | LTR |
| `es` | Español | LTR |
| `ar` | العربية | RTL |

### Routage

Toutes les routes sont préfixées par la locale : `/fr/`, `/en/`, `/es/`, `/ar/`. La locale par défaut est `fr`.

### Tests

- `tests/unit/cms-i18n.test.ts`
- `tests/unit/i18n-key-completeness.test.ts`
- `tests/unit/i18n-translations.test.ts`
- `tests/unit/i18n-urls.test.ts`
- `tests/unit/i18n-utils.test.ts`

## CI/CD et qualité

### Fichiers

```
tests/
  a11y/
  e2e/
  helpers/
  integration/
  unit/
.github/
dependabot.yml
workflows/
  ci.yml
  codeql.yml
  preview.yml
```

### Pipeline CI/CD

Pipeline GitHub Actions sur chaque push/PR vers `main` :

1. **Lint & Type Check** — ESLint + `astro check` + `pnpm audit`
2. **Unit & Integration** — Vitest + coverage (PostgreSQL 16)
3. **E2E** — Playwright (Chromium + Firefox + WebKit)
4. **Accessibilité & Performance** — Pa11y + Lighthouse CI
5. **Build** — artefact de production sur `main`

### Accessibilité et performance

- **Pa11y** — conformité WCAG AAA
- **Lighthouse CI** — performance, accessibilité, bonnes pratiques, SEO

### Commandes

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
| `pnpm test:a11y` |
| `pnpm test:visual` |

