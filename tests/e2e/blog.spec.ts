import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { BlogReactionType } from '../../src/lib/blog/constants';
import { SEED_EMAIL, SEED_PASSWORD } from './global-setup';

type StorageState = Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>;

const BASE_URL = 'http://localhost:4322';

interface WorkflowPostState {
  slug: string;
  initialTitle: string;
  editedTitle: string;
  excerpt: string;
  content: string;
  id?: string;
}

interface SeedState {
  orgId: string;
  orgSlug: string;
  orgName: string;
  globalCategoryId: string;
  globalCategoryName: string;
  globalCategorySlug: string;
  orgCategoryId: string;
  orgCategoryName: string;
  orgCategorySlug: string;
  globalPostId: string;
  globalPostTitle: string;
  globalPostSlug: string;
  orgPostTitle: string;
  orgPostSlug: string;
  globalWorkflow: WorkflowPostState;
  orgWorkflow: WorkflowPostState;
  globalCommentText: string;
  globalReviewTitle: string;
  globalReviewContent: string;
  globalReviewId?: string;
}

let seeded: SeedState;
let seedUserId = '';
let adminStorageState: StorageState | null = null;
let db: Awaited<ReturnType<typeof import('../../src/database/drizzle').getDrizzle>> | null = null;
let schema: typeof import('../../src/database/drizzle').schema | null = null;
let eqOp: typeof import('drizzle-orm').eq;
let andOp: typeof import('drizzle-orm').and;
let countFn: typeof import('drizzle-orm').count;

function parseSetCookie(header: string) {
  const [pair] = header.split(';');
  const separator = pair.indexOf('=');
  return {
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
    url: BASE_URL,
  };
}

async function createAdminStorageState(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext();
  const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
    },
    body: JSON.stringify({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
    }),
    redirect: 'manual',
  });

  const setCookie = response.headers.getSetCookie();
  if (!setCookie.length) {
    await context.close();
    throw new Error('No session cookie returned for seeded admin user');
  }

  await context.addCookies(setCookie.map(parseSetCookie));
  const state = await context.storageState();
  await context.close();
  return state;
}

async function dismissCookieDialog(page: import('@playwright/test').Page) {
  const rejectButton = page.getByRole('button', { name: /refuser|reject/i });
  if (await rejectButton.isVisible({ timeout: 1500 }).catch(() => false)) {
    await rejectButton.click();
  }
}

async function createAuthenticatedPage(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({ storageState: adminStorageState ?? undefined });
  const page = await context.newPage();
  return { context, page };
}

async function getPostStatus(postId: string) {
  if (!db || !schema) return null;
  const [row] = await db
    .select({ status: schema.blogPosts.status })
    .from(schema.blogPosts)
    .where(eqOp(schema.blogPosts.id, postId))
    .limit(1);
  return row?.status ?? null;
}

async function getTranslationTitle(postId: string) {
  if (!db || !schema) return null;
  const [row] = await db
    .select({ title: schema.blogPostTranslations.title })
    .from(schema.blogPostTranslations)
    .where(eqOp(schema.blogPostTranslations.postId, postId))
    .limit(1);
  return row?.title ?? null;
}

async function getCommentRecord(postId: string, content: string) {
  if (!db || !schema) return null;
  const [row] = await db
    .select({ id: schema.blogComments.id, status: schema.blogComments.status })
    .from(schema.blogComments)
    .where(andOp(eqOp(schema.blogComments.postId, postId), eqOp(schema.blogComments.content, content)))
    .limit(1);
  return row ?? null;
}

async function getReviewRecord(postId: string, title: string) {
  if (!db || !schema) return null;
  const [row] = await db
    .select({
      id: schema.blogPostReviews.id,
      status: schema.blogPostReviews.status,
      helpfulCount: schema.blogPostReviews.helpfulCount,
    })
    .from(schema.blogPostReviews)
    .where(andOp(eqOp(schema.blogPostReviews.postId, postId), eqOp(schema.blogPostReviews.title, title)))
    .limit(1);
  return row ?? null;
}

async function getReactionCount(postId: string, reactionType: BlogReactionType) {
  if (!db || !schema) return 0;
  const [row] = await db
    .select({ value: countFn() })
    .from(schema.blogPostReactions)
    .where(andOp(eqOp(schema.blogPostReactions.postId, postId), eqOp(schema.blogPostReactions.reactionType, reactionType)));
  return Number(row?.value ?? 0);
}

async function assignCategoryToPost(postId: string, categoryId: string) {
  if (!db || !schema) return;
  await db.insert(schema.blogPostCategories).values({ postId, categoryId }).catch(() => {});
}

function buildGlobalPostUrl(slug: string) {
  return `/fr/blog/${seeded.globalCategorySlug}/${slug}`;
}

function buildOrgPostUrl(slug: string) {
  return `/fr/${seeded.orgSlug}/blog/${seeded.orgCategorySlug}/${slug}`;
}

async function fillPostForm(
  page: import('@playwright/test').Page,
  post: WorkflowPostState,
) {
  await page.getByRole('tab', { name: /contenu|content/i }).click();
  await page.locator('#post-title').fill(post.initialTitle);
  await page.locator('#post-slug').fill(post.slug);
  await page.locator('#post-excerpt').fill(post.excerpt);
  await page.locator('#post-content').fill(post.content);
}

async function updatePostTitle(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('tab', { name: /contenu|content/i }).click();
  await page.locator('#post-title').fill(title);
  await page.locator('#post-content').fill(`<p>${title} updated content.</p>`);
}

async function submitPostForm(page: import('@playwright/test').Page) {
  await page.locator('#blog-post-form button[type="submit"]').click();
}

async function openModerationTab(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: /modération|moderation/i }).click();
  await expect(page.locator('[data-tabs-content][data-value="moderation"]')).toHaveAttribute('data-state', 'active');
}

test.describe.serial('Blog surfaces', () => {
  test.beforeAll(async () => {
    const unique = randomUUID().slice(0, 8);
    const orgSlug = `e2e-blog-org-${unique}`;
    const orgName = `E2E Blog Org ${unique}`;
    const globalCategoryId = randomUUID();
    const orgCategoryId = randomUUID();
    const globalCategorySlug = `e2e-global-category-${unique}`;
    const orgCategorySlug = `e2e-org-category-${unique}`;
    const globalCategoryName = `E2E Global Category ${unique}`;
    const orgCategoryName = `E2E Org Category ${unique}`;
    const globalPostId = randomUUID();
    const orgPostId = randomUUID();
    const globalPostSlug = `e2e-global-post-${unique}`;
    const orgPostSlug = `e2e-org-post-${unique}`;
    const globalPostTitle = `E2E Global Blog Post ${unique}`;
    const orgPostTitle = `E2E Org Blog Post ${unique}`;

    const { getTestHelpers, auth } = await import('../helpers/auth');
    const drizzleMod = await import('../../src/database/drizzle');
    const orm = await import('drizzle-orm');

    db = drizzleMod.getDrizzle();
    schema = drizzleMod.schema;
    eqOp = orm.eq;
    andOp = orm.and;
    countFn = orm.count;

    const helpers = await getTestHelpers();

    const [seedUser] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eqOp(schema.user.email, SEED_EMAIL))
      .limit(1);

    if (!seedUser) {
      throw new Error(`Seed user not found for ${SEED_EMAIL}`);
    }

    seedUserId = seedUser.id;

    const headers = await helpers.getAuthHeaders({ userId: seedUser.id });
    const org = await auth.api.createOrganization({
      body: { name: orgName, slug: orgSlug },
      headers,
    });

    const publishedAt = new Date();

    await db.insert(schema.blogPosts).values([
      {
        id: globalPostId,
        organizationId: null,
        authorId: seedUser.id,
        slug: globalPostSlug,
        status: 'PUBLISHED',
        commentStatus: 'OPEN',
        allowReviews: true,
        publishedAt,
        updatedBy: seedUser.id,
      },
      {
        id: orgPostId,
        organizationId: org.id,
        authorId: seedUser.id,
        slug: orgPostSlug,
        status: 'PUBLISHED',
        commentStatus: 'OPEN',
        allowReviews: true,
        publishedAt,
        updatedBy: seedUser.id,
      },
    ]);

    await db.insert(schema.blogPostTranslations).values([
      {
        postId: globalPostId,
        locale: 'fr',
        title: globalPostTitle,
        slug: globalPostSlug,
        content: `<p>${globalPostTitle} content.</p>`,
        excerpt: `${globalPostTitle} excerpt.`,
        metaTitle: globalPostTitle,
        metaDescription: `${globalPostTitle} meta description.`,
      },
      {
        postId: orgPostId,
        // Le trigger de tenant exige l'organization_id du parent sur la traduction.
        organizationId: org.id,
        locale: 'fr',
        title: orgPostTitle,
        slug: orgPostSlug,
        content: `<p>${orgPostTitle} content.</p>`,
        excerpt: `${orgPostTitle} excerpt.`,
        metaTitle: orgPostTitle,
        metaDescription: `${orgPostTitle} meta description.`,
      },
    ]);

    await db.insert(schema.blogCategories).values([
      {
        id: globalCategoryId,
        organizationId: null,
        slug: globalCategorySlug,
      },
      {
        id: orgCategoryId,
        organizationId: org.id,
        slug: orgCategorySlug,
      },
    ]);

    await db.insert(schema.blogCategoryTranslations).values([
      {
        categoryId: globalCategoryId,
        locale: 'fr',
        name: globalCategoryName,
        slug: globalCategorySlug,
      },
      {
        categoryId: orgCategoryId,
        organizationId: org.id,
        locale: 'fr',
        name: orgCategoryName,
        slug: orgCategorySlug,
      },
    ]);

    await db.insert(schema.blogPostCategories).values([
      { postId: globalPostId, categoryId: globalCategoryId },
      { postId: orgPostId, categoryId: orgCategoryId },
    ]);

    seeded = {
      orgId: org.id,
      orgSlug,
      orgName,
      globalCategoryId,
      globalCategoryName,
      globalCategorySlug,
      orgCategoryId,
      orgCategoryName,
      orgCategorySlug,
      globalPostId,
      globalPostTitle,
      globalPostSlug,
      orgPostTitle,
      orgPostSlug,
      globalWorkflow: {
        slug: `e2e-global-workflow-${unique}`,
        initialTitle: `E2E Global Workflow Draft ${unique}`,
        editedTitle: `E2E Global Workflow Published ${unique}`,
        excerpt: `Global workflow excerpt ${unique}`,
        content: `<p>Global workflow content ${unique}</p>`,
      },
      orgWorkflow: {
        slug: `e2e-org-workflow-${unique}`,
        initialTitle: `E2E Org Workflow Draft ${unique}`,
        editedTitle: `E2E Org Workflow Published ${unique}`,
        excerpt: `Org workflow excerpt ${unique}`,
        content: `<p>Org workflow content ${unique}</p>`,
      },
      globalCommentText: `E2E pending comment ${unique}`,
      globalReviewTitle: `E2E Review ${unique}`,
      globalReviewContent: `E2E review content ${unique}`,
    };
  });

  test.beforeAll(async ({ browser }) => {
    adminStorageState = await createAdminStorageState(browser);
  });

  test.afterAll(async () => {
    if (!seeded || !db || !schema) return;

    const { getTestHelpers, auth } = await import('../helpers/auth');
    const helpers = await getTestHelpers();

    if (seedUserId) {
      const headers = await helpers.getAuthHeaders({ userId: seedUserId });
      await auth.api.deleteOrganization({
        body: { organizationId: seeded.orgId },
        headers,
      }).catch(() => {});
    }

    await db.delete(schema.blogPosts).where(eqOp(schema.blogPosts.id, seeded.globalPostId)).catch(() => {});
    if (seeded.globalWorkflow.id) {
      await db.delete(schema.blogPosts).where(eqOp(schema.blogPosts.id, seeded.globalWorkflow.id)).catch(() => {});
    }
    await db.delete(schema.blogCategories).where(eqOp(schema.blogCategories.id, seeded.globalCategoryId)).catch(() => {});
    await db.delete(schema.blogCategories).where(eqOp(schema.blogCategories.id, seeded.orgCategoryId)).catch(() => {});
  });

  test('global public blog shows the global post only', async ({ page }) => {
    const response = await page.goto(
      `/fr/blog?q=${encodeURIComponent(seeded.globalPostTitle)}`,
      { waitUntil: 'networkidle' },
    );
    expect(response?.status()).toBe(200);

    const main = page.locator('main');
    const postLink = main.getByRole('link', { name: seeded.globalPostTitle }).first();
    await expect(postLink).toBeVisible();
    await expect(postLink).toHaveAttribute('href', buildGlobalPostUrl(seeded.globalPostSlug));
    await expect(main.getByRole('link', { name: seeded.orgPostTitle })).toHaveCount(0);
  });

  test('global public blog post detail redirects to the canonical category URL', async ({ page }) => {
    const response = await page.goto(`/fr/blog/${seeded.globalPostSlug}`, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    await expect(page).toHaveURL(buildGlobalPostUrl(seeded.globalPostSlug));
    await expect(page.getByRole('heading', { name: seeded.globalPostTitle })).toBeVisible();
  });

  test('organization public blog shows the org post only', async ({ page }) => {
    const response = await page.goto(
      `/fr/${seeded.orgSlug}/blog?q=${encodeURIComponent(seeded.orgPostTitle)}`,
      { waitUntil: 'networkidle' },
    );
    expect(response?.status()).toBe(200);

    const main = page.locator('main');
    const postLink = main.getByRole('link', { name: seeded.orgPostTitle }).first();
    await expect(postLink).toBeVisible();
    await expect(postLink).toHaveAttribute('href', buildOrgPostUrl(seeded.orgPostSlug));
    await expect(main.getByRole('link', { name: seeded.globalPostTitle })).toHaveCount(0);
  });

  test('organization public blog post detail redirects to the canonical category URL', async ({ page }) => {
    const response = await page.goto(`/fr/${seeded.orgSlug}/blog/${seeded.orgPostSlug}`, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);

    await expect(page).toHaveURL(buildOrgPostUrl(seeded.orgPostSlug));
    await expect(page.getByRole('heading', { name: seeded.orgPostTitle })).toBeVisible();
  });

  test('global admin blog shows global tenant posts', async ({ browser }) => {
    const { context, page } = await createAuthenticatedPage(browser);

    try {
      const response = await page.goto('/fr/admin/blog', { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);

      const table = page.locator('table');
      await expect(page.getByRole('heading', { name: /Administration du blog/i })).toBeVisible();
      await expect(table).toContainText(seeded.globalPostTitle);
      await expect(table).not.toContainText(seeded.orgPostTitle);
    } finally {
      await context.close();
    }
  });

  test('organization admin blog shows org tenant posts', async ({ browser }) => {
    const { context, page } = await createAuthenticatedPage(browser);

    try {
      const response = await page.goto(`/fr/${seeded.orgSlug}/admin/blog`, { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);

      const table = page.locator('table');
      await expect(page).toHaveURL(new RegExp(`/fr/${seeded.orgSlug}/admin/blog`));
      await expect(table).toContainText(seeded.orgPostTitle);
      await expect(table).not.toContainText(seeded.globalPostTitle);
    } finally {
      await context.close();
    }
  });

  test('global admin can create and edit a draft workflow post', async ({ browser }) => {
    const { context, page } = await createAuthenticatedPage(browser);

    try {
      const response = await page.goto('/fr/admin/blog/new', { waitUntil: 'networkidle' });
      expect(response?.status()).toBe(200);

      await fillPostForm(page, seeded.globalWorkflow);
      await submitPostForm(page);

      await expect(page).toHaveURL(/\/fr\/admin\/blog\/[^/]+\/edit/);
      const match = page.url().match(/\/fr\/admin\/blog\/([^/]+)\/edit/);
      seeded.globalWorkflow.id = match?.[1];
      expect(seeded.globalWorkflow.id).toBeTruthy();
      await assignCategoryToPost(seeded.globalWorkflow.id!, seeded.globalCategoryId);
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByRole('link', { name: /aperçu|preview/i })).toHaveAttribute(
        'href',
        buildGlobalPostUrl(seeded.globalWorkflow.slug),
      );

      await expect.poll(async () => getPostStatus(seeded.globalWorkflow.id!)).toBe('DRAFT');
      await expect.poll(async () => getTranslationTitle(seeded.globalWorkflow.id!)).toBe(seeded.globalWorkflow.initialTitle);

      await updatePostTitle(page, seeded.globalWorkflow.editedTitle);
      await submitPostForm(page);

      await expect.poll(async () => getTranslationTitle(seeded.globalWorkflow.id!)).toBe(seeded.globalWorkflow.editedTitle);
    } finally {
      await context.close();
    }
  });

  test('global admin can publish the workflow post and it appears on the public blog', async ({ browser, page }) => {
    const { context, page: adminPage } = await createAuthenticatedPage(browser);

    try {
      await adminPage.goto('/fr/admin/blog', { waitUntil: 'networkidle' });
      const row = adminPage.locator('tbody tr').filter({ hasText: seeded.globalWorkflow.editedTitle }).first();
      await expect(row).toBeVisible();
      await expect(row.getByRole('link', { name: /aperçu|preview/i })).toHaveAttribute(
        'href',
        buildGlobalPostUrl(seeded.globalWorkflow.slug),
      );
      await row.locator('.publish-btn').click();

      await expect.poll(async () => getPostStatus(seeded.globalWorkflow.id!)).toBe('PUBLISHED');
    } finally {
      await context.close();
    }

    const listResponse = await page.goto(
      `/fr/blog?q=${encodeURIComponent(seeded.globalWorkflow.editedTitle)}`,
      { waitUntil: 'networkidle' },
    );
    expect(listResponse?.status()).toBe(200);
    await dismissCookieDialog(page);
    const publicLink = page.locator('main').getByRole('link', { name: seeded.globalWorkflow.editedTitle }).first();
    await expect(publicLink).toBeVisible();
    await expect(publicLink).toHaveAttribute('href', buildGlobalPostUrl(seeded.globalWorkflow.slug));

    const detailResponse = await page.goto(buildGlobalPostUrl(seeded.globalWorkflow.slug), { waitUntil: 'networkidle' });
    expect(detailResponse?.status()).toBe(200);
    await dismissCookieDialog(page);
    await expect(page.getByRole('heading', { name: seeded.globalWorkflow.editedTitle })).toBeVisible();
  });

  test('guest comment stays pending until moderation', async ({ page }) => {
    const response = await page.goto(buildGlobalPostUrl(seeded.globalWorkflow.slug), { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await dismissCookieDialog(page);

    await page.locator('#comment-form').scrollIntoViewIfNeeded();
    await page.locator('#comment-guest-name').fill('E2E Guest');
    await page.locator('#comment-guest-email').fill('guest-e2e@test.com');
    await page.locator('#comment-content').fill(seeded.globalCommentText);
    await page.locator('#comment-form button[type="submit"]').click();

    await expect.poll(async () => {
      const record = await getCommentRecord(seeded.globalWorkflow.id!, seeded.globalCommentText);
      return record?.status ?? null;
    }).toBe('PENDING');

    await page.goto(buildGlobalPostUrl(seeded.globalWorkflow.slug), { waitUntil: 'networkidle' });
    await dismissCookieDialog(page);
    await expect(page.locator('[data-comment-id]').filter({ hasText: seeded.globalCommentText })).toHaveCount(0);
  });

  test('global admin can approve the pending comment and it becomes public', async ({ browser, page }) => {
    const { context, page: adminPage } = await createAuthenticatedPage(browser);

    try {
      await adminPage.goto('/fr/admin/blog', { waitUntil: 'networkidle' });
      await openModerationTab(adminPage);

      const commentCard = adminPage.locator('[data-comment-id]').filter({ hasText: seeded.globalCommentText }).first();
      await expect(commentCard).toBeVisible();
      await commentCard.locator('.comment-action-btn[data-action="APPROVE"]').click();

      await expect.poll(async () => {
        const record = await getCommentRecord(seeded.globalWorkflow.id!, seeded.globalCommentText);
        return record?.status ?? null;
      }).toBe('APPROVED');
    } finally {
      await context.close();
    }

    await page.goto(buildGlobalPostUrl(seeded.globalWorkflow.slug), { waitUntil: 'networkidle' });
    await dismissCookieDialog(page);
    await expect(page.locator('[data-comment-id]').filter({ hasText: seeded.globalCommentText })).toHaveCount(1);
  });

  test('authenticated user can submit a pending review and a reaction on the global post', async ({ browser, page }) => {
    const { context: reviewContext, page: authedPage } = await createAuthenticatedPage(browser);

    try {
      await authedPage.goto(buildGlobalPostUrl(seeded.globalWorkflow.slug), { waitUntil: 'networkidle' });
      await dismissCookieDialog(authedPage);

      await authedPage.locator('#review-form').scrollIntoViewIfNeeded();
      await authedPage.locator('#review-title').fill(seeded.globalReviewTitle);
      await authedPage.locator('#review-content').fill(seeded.globalReviewContent);
      await authedPage.locator('#review-form button[type="submit"]').click();

      await expect.poll(async () => Boolean(await getReviewRecord(seeded.globalWorkflow.id!, seeded.globalReviewTitle))).toBe(true);

      const reviewRecord = await getReviewRecord(seeded.globalWorkflow.id!, seeded.globalReviewTitle);
      expect(reviewRecord?.status).toBe('PENDING');
      seeded.globalReviewId = reviewRecord?.id;

      await authedPage.goto(buildGlobalPostUrl(seeded.globalWorkflow.slug), { waitUntil: 'networkidle' });
      await dismissCookieDialog(authedPage);
      await authedPage.locator('.reaction-btn[data-reaction-type="LIKE"]').click();

      await expect.poll(async () => getReactionCount(seeded.globalWorkflow.id!, 'LIKE')).toBe(1);
    } finally {
      await reviewContext.close();
    }

    await page.goto(buildGlobalPostUrl(seeded.globalWorkflow.slug), { waitUntil: 'networkidle' });
    await dismissCookieDialog(page);
    await expect(page.locator('[data-review-id]').filter({ hasText: seeded.globalReviewTitle })).toHaveCount(0);
  });

  test('global admin can approve the review and the helpful vote persists', async ({ browser, page }) => {
    const { context, page: adminPage } = await createAuthenticatedPage(browser);

    try {
      await adminPage.goto('/fr/admin/blog', { waitUntil: 'networkidle' });
      await openModerationTab(adminPage);

      const reviewCard = adminPage.locator('[data-review-id]').filter({ hasText: seeded.globalReviewTitle }).first();
      await expect(reviewCard).toBeVisible();
      await reviewCard.locator('.review-action-btn[data-status="APPROVED"]').click();

      await expect.poll(async () => {
        const record = await getReviewRecord(seeded.globalWorkflow.id!, seeded.globalReviewTitle);
        return record?.status ?? null;
      }).toBe('APPROVED');
    } finally {
      await context.close();
    }

    const { context: helpfulContext, page: authedPage } = await createAuthenticatedPage(browser);

    try {
      await authedPage.goto(buildGlobalPostUrl(seeded.globalWorkflow.slug), { waitUntil: 'networkidle' });
      await dismissCookieDialog(authedPage);

      const publicReview = authedPage.locator('[data-review-id]').filter({ hasText: seeded.globalReviewTitle }).first();
      await expect(publicReview).toBeVisible();
      await publicReview.locator('.review-helpful-btn[data-value="true"]').click();

      await expect.poll(async () => {
        const record = await getReviewRecord(seeded.globalWorkflow.id!, seeded.globalReviewTitle);
        return Number(record?.helpfulCount ?? 0);
      }).toBe(1);
    } finally {
      await helpfulContext.close();
    }

    await page.goto(buildGlobalPostUrl(seeded.globalWorkflow.slug), { waitUntil: 'networkidle' });
    await dismissCookieDialog(page);
    await expect(page.locator('[data-review-id]').filter({ hasText: seeded.globalReviewTitle })).toHaveCount(1);
  });

  test('global admin can delete the workflow post and it disappears from public pages', async ({ browser, page }) => {
    const { context, page: adminPage } = await createAuthenticatedPage(browser);

    try {
      await adminPage.goto('/fr/admin/blog', { waitUntil: 'networkidle' });
      const row = adminPage.locator('tbody tr').filter({ hasText: seeded.globalWorkflow.editedTitle }).first();
      await expect(row).toBeVisible();
      adminPage.once('dialog', (dialog) => dialog.accept());
      await row.locator('.delete-btn').click();

      await expect.poll(async () => getPostStatus(seeded.globalWorkflow.id!)).toBe('DELETED');
    } finally {
      await context.close();
    }

    const listResponse = await page.goto(
      `/fr/blog?q=${encodeURIComponent(seeded.globalWorkflow.editedTitle)}`,
      { waitUntil: 'networkidle' },
    );
    expect(listResponse?.status()).toBe(200);
    await dismissCookieDialog(page);
    await expect(page.locator('main').getByRole('link', { name: seeded.globalWorkflow.editedTitle })).toHaveCount(0);

    const detailResponse = await page.goto(buildGlobalPostUrl(seeded.globalWorkflow.slug), { waitUntil: 'networkidle' });
    expect(detailResponse?.status()).toBe(404);
  });

  test('organization admin can create publish isolate and delete an organization workflow post', async ({ browser, page }) => {
    const { context, page: adminPage } = await createAuthenticatedPage(browser);

    try {
      const createResponse = await adminPage.goto(`/fr/${seeded.orgSlug}/admin/blog/new`, { waitUntil: 'networkidle' });
      expect(createResponse?.status()).toBe(200);

      await fillPostForm(adminPage, seeded.orgWorkflow);
      await submitPostForm(adminPage);

      await expect(adminPage).toHaveURL(new RegExp(`/fr/${seeded.orgSlug}/admin/blog/[^/]+/edit`));
      const match = adminPage.url().match(new RegExp(`/fr/${seeded.orgSlug}/admin/blog/([^/]+)/edit`));
      seeded.orgWorkflow.id = match?.[1];
      expect(seeded.orgWorkflow.id).toBeTruthy();
      await assignCategoryToPost(seeded.orgWorkflow.id!, seeded.orgCategoryId);
      await adminPage.reload({ waitUntil: 'networkidle' });
      await expect(adminPage.getByRole('link', { name: /aperçu|preview/i })).toHaveAttribute(
        'href',
        buildOrgPostUrl(seeded.orgWorkflow.slug),
      );

      await expect.poll(async () => getPostStatus(seeded.orgWorkflow.id!)).toBe('DRAFT');

      await updatePostTitle(adminPage, seeded.orgWorkflow.editedTitle);
      await submitPostForm(adminPage);
      await expect.poll(async () => getTranslationTitle(seeded.orgWorkflow.id!)).toBe(seeded.orgWorkflow.editedTitle);

      await adminPage.goto(`/fr/${seeded.orgSlug}/admin/blog`, { waitUntil: 'networkidle' });
      const row = adminPage.locator('tbody tr').filter({ hasText: seeded.orgWorkflow.editedTitle }).first();
      await expect(row).toBeVisible();
      await expect(row.getByRole('link', { name: /aperçu|preview/i })).toHaveAttribute(
        'href',
        buildOrgPostUrl(seeded.orgWorkflow.slug),
      );
      await row.locator('.publish-btn').click();

      await expect.poll(async () => getPostStatus(seeded.orgWorkflow.id!)).toBe('PUBLISHED');
    } finally {
      await context.close();
    }

    const orgListResponse = await page.goto(
      `/fr/${seeded.orgSlug}/blog?q=${encodeURIComponent(seeded.orgWorkflow.editedTitle)}`,
      { waitUntil: 'networkidle' },
    );
    expect(orgListResponse?.status()).toBe(200);
    await dismissCookieDialog(page);
    const orgPublicLink = page.locator('main').getByRole('link', { name: seeded.orgWorkflow.editedTitle }).first();
    await expect(orgPublicLink).toBeVisible();
    await expect(orgPublicLink).toHaveAttribute('href', buildOrgPostUrl(seeded.orgWorkflow.slug));

    const globalListResponse = await page.goto(
      `/fr/blog?q=${encodeURIComponent(seeded.orgWorkflow.editedTitle)}`,
      { waitUntil: 'networkidle' },
    );
    expect(globalListResponse?.status()).toBe(200);
    await dismissCookieDialog(page);
    await expect(page.locator('main').getByRole('link', { name: seeded.orgWorkflow.editedTitle })).toHaveCount(0);

    const orgDetailResponse = await page.goto(buildOrgPostUrl(seeded.orgWorkflow.slug), { waitUntil: 'networkidle' });
    expect(orgDetailResponse?.status()).toBe(200);
    await dismissCookieDialog(page);
    await expect(page.getByRole('heading', { name: seeded.orgWorkflow.editedTitle })).toBeVisible();

    const { context: cleanupContext, page: cleanupPage } = await createAuthenticatedPage(browser);

    try {
      await cleanupPage.goto(`/fr/${seeded.orgSlug}/admin/blog`, { waitUntil: 'networkidle' });
      const row = cleanupPage.locator('tbody tr').filter({ hasText: seeded.orgWorkflow.editedTitle }).first();
      await expect(row).toBeVisible();
      cleanupPage.once('dialog', (dialog) => dialog.accept());
      await row.locator('.delete-btn').click();

      await expect.poll(async () => getPostStatus(seeded.orgWorkflow.id!)).toBe('DELETED');
    } finally {
      await cleanupContext.close();
    }

    const deletedOrgResponse = await page.goto(
      `/fr/${seeded.orgSlug}/blog?q=${encodeURIComponent(seeded.orgWorkflow.editedTitle)}`,
      { waitUntil: 'networkidle' },
    );
    expect(deletedOrgResponse?.status()).toBe(200);
    await dismissCookieDialog(page);
    await expect(page.locator('main').getByRole('link', { name: seeded.orgWorkflow.editedTitle })).toHaveCount(0);
  });
});