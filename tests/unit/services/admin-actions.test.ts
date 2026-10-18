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
  services: { id: "id", organizationId: "organizationId", providerId: "providerId", slug: "slug", status: "status" },
  serviceTranslations: { id: "id", serviceId: "serviceId", organizationId: "organizationId", locale: "locale", title: "title", slug: "slug", content: "content" },
  serviceCategoryLinks: { serviceId: "serviceId", categoryId: "categoryId" },
  serviceTagLinks: { serviceId: "serviceId", tagId: "tagId" },
  serviceSeo: { id: "id", serviceId: "serviceId", locale: "locale" },
  serviceRevisions: { serviceId: "serviceId" },
  serviceLocks: { serviceId: "serviceId", userId: "userId", sessionId: "sessionId", expiresAt: "expiresAt" },
  serviceCategories: { id: "id", organizationId: "organizationId" },
  serviceTags: { id: "id", organizationId: "organizationId" },
  mediaFiles: { id: "id", organizationId: "organizationId" },
}));

const { permission, assertInTenant, assertLockOwner } = vi.hoisted(() => ({
  permission: vi.fn(async () => ({ id: "user-1", role: "admin", banned: false })),
  assertInTenant: vi.fn(async () => ({ id: "service-1", organizationId: null, status: "DRAFT", providerId: "user-1" })),
  assertLockOwner: vi.fn(async () => undefined),
}));
vi.mock("@/modules/services/permissions", () => ({
  assertServicePermission: permission,
  resolveServiceTenant: (input: { organizationId?: string | null }) => ({ organizationId: input.organizationId ?? null, isOrgContext: Boolean(input.organizationId) }),
  assertServiceInTenant: assertInTenant,
  assertServiceLockOwner: assertLockOwner,
  assertServiceCategoryInTenant: vi.fn(async () => undefined),
  assertServiceTagInTenant: vi.fn(async () => undefined),
  assertServiceMediaInTenant: vi.fn(async () => undefined),
  serviceRateLimit: vi.fn(),
}));

import { createService, updateService } from "@/actions/services/service";

type Handler = { handler: (input: unknown, context: unknown) => Promise<unknown> };
const create = createService as unknown as Handler;
const updateAction = updateService as unknown as Handler;

function query(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = () => Promise.resolve(rows);
  chain.then = (resolve: (value: unknown[]) => unknown) => resolve(rows);
  return chain;
}

function mutation(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  chain.values = () => chain;
  chain.set = () => chain;
  chain.where = () => chain;
  chain.returning = () => Promise.resolve(rows);
  chain.then = (resolve: (value: undefined) => unknown) => resolve(undefined);
  return chain;
}

function context() {
  return {
    locals: { user: { id: "user-1", role: "admin", banned: false }, session: { id: "session-1" } },
    request: { headers: new Headers() },
    clientAddress: "127.0.0.1",
  } as never;
}

const validCreate = {
  organizationId: null,
  locale: "fr",
  title: "Service de conseil fiable",
  slug: "service-de-conseil-fiable",
  content: "<p>Contenu du service</p>",
  categoryIds: [],
  tagIds: [],
  isMobile: false,
  isFeatured: false,
  status: "DRAFT",
  publishedAt: null,
};

beforeEach(() => {
  select.mockReset().mockReturnValue(query());
  insert.mockReset().mockReturnValue(mutation());
  update.mockReset().mockReturnValue(mutation());
  remove.mockReset().mockReturnValue(mutation());
  transaction.mockReset().mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  permission.mockClear();
  assertInTenant.mockClear();
  assertLockOwner.mockClear();
});

describe("services admin CRUD actions", () => {
  it("creates a draft, translation, SEO row, and initial revision atomically", async () => {
    insert.mockReturnValueOnce(mutation([{ id: "service-1" }])).mockReturnValue(mutation());

    await expect(create.handler(validCreate, context())).resolves.toEqual({ id: "service-1" });

    expect(transaction).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalled();
    expect(permission).toHaveBeenCalledWith(expect.anything(), { organizationId: null, isOrgContext: false }, { service: ["create"] });
  });

  it("updates the selected locale without changing lifecycle state", async () => {
    select
      .mockReturnValueOnce(query([{ id: "service-1", organizationId: null, status: "DRAFT", providerId: "user-1" }]))
      .mockReturnValueOnce(query([{ id: "translation-1", serviceId: "service-1", locale: "fr", title: "Old", slug: "old", content: "old content" }]))
      .mockReturnValueOnce(query([]));

    await expect(updateAction.handler({ id: "00000000-0000-4000-8000-000000000001", organizationId: null, locale: "fr", title: "New title", slug: "new-title", content: "<p>new content</p>", categoryIds: [], tagIds: [] }, context())).resolves.toEqual({ id: "00000000-0000-4000-8000-000000000001" });

    expect(assertLockOwner).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", "user-1", "session-1");
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("does not allow a handler to update a service outside the resolved tenant", async () => {
    assertInTenant.mockRejectedValueOnce(new Error("tenant mismatch"));

    await expect(updateAction.handler({ id: "00000000-0000-4000-8000-000000000001", organizationId: "org-1", locale: "fr", title: "New title" }, context())).rejects.toThrow("tenant mismatch");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("stops before persistence when the service is locked by another editor", async () => {
    assertLockOwner.mockRejectedValueOnce(new Error("locked by another editor"));

    await expect(updateAction.handler({ id: "00000000-0000-4000-8000-000000000001", organizationId: null, locale: "fr", title: "New title" }, context())).rejects.toThrow("locked by another editor");
    expect(transaction).not.toHaveBeenCalled();
  });
});
