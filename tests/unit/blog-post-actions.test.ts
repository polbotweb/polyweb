import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("astro:actions", () => ({
  ActionError: class extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  },
  defineAction: (definition: unknown) => definition,
}));

const select = vi.fn();
const insert = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const transaction = vi.fn();
const db = { select, insert, update, delete: remove, transaction };

vi.mock("@database/drizzle", () => ({ getDrizzle: () => db }));
vi.mock("@database/cache", () => ({ invalidateCache: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn(async () => undefined), extractIp: vi.fn(() => "127.0.0.1") }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 })) }));
vi.mock("@i18n/config", () => ({ LOCALES: ["fr", "en", "es", "ar"], DEFAULT_LOCALE: "fr" }));
vi.mock("@database/schemas", () => ({
  blogPosts: { id: "id", organizationId: "organizationId", authorId: "authorId", status: "status", slug: "slug", publishedAt: "publishedAt", isFeatured: "isFeatured", isSticky: "isSticky", commentStatus: "commentStatus", allowReviews: "allowReviews", seoScore: "seoScore", updatedBy: "updatedBy" },
  blogPostTranslations: { id: "id", postId: "postId", organizationId: "organizationId", locale: "locale", title: "title", slug: "slug", content: "content", excerpt: "excerpt", updatedAt: "updatedAt" },
  blogPostCategories: { postId: "postId", categoryId: "categoryId" },
  blogPostTags: { postId: "postId", tagId: "tagId" },
  blogPostRevisions: { id: "id", postId: "postId", createdAt: "createdAt" },
  blogPostSeo: { id: "id", postId: "postId", locale: "locale" },
  blogPostGalleries: { id: "id", postId: "postId", title: "title", description: "description", sortOrder: "sortOrder" },
  blogPostGalleryMedia: { galleryId: "galleryId", mediaId: "mediaId" },
  blogPostLinks: { id: "id", sourcePostId: "sourcePostId", targetPostId: "targetPostId", linkType: "linkType", sortOrder: "sortOrder" },
  blogPostLocks: { id: "id", postId: "postId", userId: "userId", expiresAt: "expiresAt" },
  blogCategories: { id: "id", organizationId: "organizationId" },
  blogTags: { id: "id", organizationId: "organizationId" },
  mediaFiles: { id: "id", organizationId: "organizationId" },
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getFullOrganization: vi.fn(async () => null),
      userHasPermission: vi.fn(async () => ({ success: true })),
      hasPermission: vi.fn(async () => ({ success: true })),
    },
  },
}));

import { createBlogPost, updateBlogPost } from "@/actions/blog/post";
import {
  publishBlogPost,
  unpublishBlogPost,
  archiveBlogPost,
  restoreBlogPost,
  deleteBlogPost,
} from "@/actions/blog/lifecycle";

function chain(rows: unknown[] = []) {
  const value: Record<string, unknown> = {};
  const self = value as {
    from: () => typeof self;
    where: () => typeof self;
    innerJoin: () => typeof self;
    leftJoin: () => typeof self;
    orderBy: () => typeof self;
    limit: () => Promise<unknown[]>;
    then: (resolve: (rows: unknown[]) => unknown) => unknown;
  };
  self.from = () => self;
  self.where = () => self;
  self.innerJoin = () => self;
  self.leftJoin = () => self;
  self.orderBy = () => self;
  self.limit = () => Promise.resolve(rows);
  self.then = (resolve) => resolve(rows);
  return self;
}

function mutation(returning: unknown[] = []) {
  const self = {
    values: vi.fn(() => self),
    set: vi.fn(() => self),
    where: vi.fn(() => self),
    returning: vi.fn(async () => returning),
    then: (resolve: (value: undefined) => unknown) => resolve(undefined),
  };
  return self;
}

function context() {
  return {
    locals: { user: { id: "user-1", role: "admin", banned: false }, session: { id: "session-1" } },
    request: { headers: new Headers() },
    clientAddress: "127.0.0.1",
  } as never;
}

beforeEach(() => {
  select.mockReset().mockReturnValue(chain());
  insert.mockReset();
  update.mockReset();
  remove.mockReset();
  transaction.mockReset().mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  insert.mockReturnValue(mutation([{ id: "post-1" }]));
  update.mockReturnValue(mutation());
  remove.mockReturnValue(mutation());
});

describe("createBlogPost", () => {
  it("creates a draft in one transaction", async () => {
    const action = createBlogPost as unknown as { handler: (input: unknown, ctx: unknown) => Promise<{ id: string; slug: string }> };
    const result = await action.handler({
      locale: "fr",
      title: "A valid title",
      slug: "a-valid-title",
      content: "<p>content</p>",
      status: "DRAFT",
      organizationId: null,
    }, context());
    expect(result).toEqual({ id: "post-1", slug: "a-valid-title" });
    expect(transaction).toHaveBeenCalledOnce();
  });
});

describe("updateBlogPost", () => {
  it("accepts editorial changes without a lifecycle status", async () => {
    select
      .mockReturnValueOnce(chain([{ id: "post-1", organizationId: null, status: "DRAFT" }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(chain([]));
    const action = updateBlogPost as unknown as { handler: (input: unknown, ctx: unknown) => Promise<{ id: string }> };
    const result = await action.handler({ id: "post-1", organizationId: null, locale: "fr", title: "Updated", slug: "updated", content: "<p>content</p>" }, context());
    expect(result).toEqual({ id: "post-1" });
  });
});

describe("post lifecycle", () => {
  const handler = (action: unknown) => action as { handler: (input: unknown, ctx: unknown) => Promise<{ success: boolean }> };
  it("publishes only through publishBlogPost", async () => {
    select.mockReturnValueOnce(chain([{ id: "post-1", organizationId: null, status: "DRAFT" }]));
    expect(await handler(publishBlogPost).handler({ id: "post-1", organizationId: null }, context())).toEqual({ success: true });
    expect(update).toHaveBeenCalled();
  });
  it("unpublishes a published post", async () => {
    select.mockReturnValueOnce(chain([{ id: "post-1", organizationId: null, status: "PUBLISHED" }]));
    expect(await handler(unpublishBlogPost).handler({ id: "post-1", organizationId: null }, context())).toEqual({ success: true });
  });
  it("rejects illegal archive from deleted state", async () => {
    select.mockReturnValueOnce(chain([{ id: "post-1", organizationId: null, status: "DELETED" }]));
    await expect(handler(archiveBlogPost).handler({ id: "post-1", organizationId: null }, context())).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("restores an archived post to draft", async () => {
    select.mockReturnValueOnce(chain([{ id: "post-1", organizationId: null, status: "ARCHIVED" }]));
    expect(await handler(restoreBlogPost).handler({ id: "post-1", organizationId: null }, context())).toEqual({ success: true });
  });
  it("soft deletes with a revision", async () => {
    select.mockReturnValueOnce(chain([{ id: "post-1", organizationId: null, status: "DRAFT" }])).mockReturnValueOnce(chain([{ locale: "fr", title: "Title", slug: "title", content: "content", excerpt: null, updatedAt: new Date(), id: "t1" }]));
    expect(await handler(deleteBlogPost).handler({ id: "post-1", organizationId: null }, context())).toEqual({ success: true });
    expect(transaction).toHaveBeenCalledOnce();
  });
});
