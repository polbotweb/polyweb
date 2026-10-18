import { createHash } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  update: vi.fn(),
}));
const smtpMocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  template: vi.fn(),
}));
const auditMocks = vi.hoisted(() => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("@database/drizzle", () => ({
  getDrizzle: vi.fn(() => dbMocks),
}));
vi.mock("@/smtp/send", () => ({
  sendEmail: smtpMocks.sendEmail,
}));
vi.mock("@/smtp/templates/blog-newsletter", () => ({
  blogNewsletterConfirmTemplate: smtpMocks.template,
}));
vi.mock("@/lib/audit", () => ({
  logAuditEvent: auditMocks.logAuditEvent,
}));

import {
  blogNewsletterService,
  NewsletterConfigurationError,
  NewsletterDeliveryError,
  NewsletterOrganizationNotFoundError,
} from "@/lib/newsletter/blog-newsletter-service";

const tx = {
  execute: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
};
let selectResults: unknown[][];
let txUpdateResults: unknown[][];
let insertResults: unknown[][];
let rootUpdateResults: unknown[][];
let txSets: Array<Record<string, unknown>>;
let insertedValues: Array<Record<string, unknown>>;
let rootSets: Array<Record<string, unknown>>;
let rootWhere: unknown[];

function selectChain(result: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(result),
      }),
    }),
  };
}

function updateChain(
  result: unknown[],
  sets: Array<Record<string, unknown>>,
  whereClauses?: unknown[],
) {
  return {
    set: (values: Record<string, unknown>) => {
      sets.push(values);
      return {
        where: (condition: unknown) => {
          whereClauses?.push(condition);
          return {
            returning: () => Promise.resolve(result),
          };
        },
      };
    },
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SITE_URL", "https://atomic.example/application-path");
  selectResults = [];
  txUpdateResults = [];
  insertResults = [];
  rootUpdateResults = [];
  txSets = [];
  insertedValues = [];
  rootSets = [];
  rootWhere = [];

  tx.execute.mockResolvedValue(undefined);
  tx.select.mockImplementation(() => selectChain(selectResults.shift() ?? []));
  tx.update.mockImplementation(() =>
    updateChain(txUpdateResults.shift() ?? [], txSets),
  );
  tx.insert.mockImplementation(() => ({
    values: (values: Record<string, unknown>) => {
      insertedValues.push(values);
      return {
        returning: () => Promise.resolve(insertResults.shift() ?? []),
      };
    },
  }));
  dbMocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) =>
    callback(tx),
  );
  dbMocks.update.mockImplementation(() =>
    updateChain(rootUpdateResults.shift() ?? [], rootSets, rootWhere),
  );
  smtpMocks.template.mockImplementation(
    (options: { confirmUrl: string; unsubscribeUrl: string }) => ({
      subject: "Confirm",
      html: options.confirmUrl,
      text: options.unsubscribeUrl,
    }),
  );
  smtpMocks.sendEmail.mockResolvedValue(undefined);
  auditMocks.logAuditEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("blog newsletter business service", () => {
  it("stores purpose-separated hashes and builds links from the configured origin", async () => {
    selectResults.push([]);
    insertResults.push([{ id: "subscriber-1" }]);

    await blogNewsletterService.subscribe({
      email: " Reader@Example.COM ",
      locale: "fr",
      organizationId: null,
      configuredSite: new URL("https://ignored-request.invalid"),
    });

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      email: "reader@example.com",
      status: "PENDING",
      confirmedAt: null,
      unsubscribedAt: null,
      tokenUsedAt: null,
    });

    const templateInput = smtpMocks.template.mock.calls[0][0] as {
      confirmUrl: string;
      unsubscribeUrl: string;
    };
    const confirmationToken = new URL(templateInput.confirmUrl).searchParams.get("token");
    const unsubscribeToken = new URL(templateInput.unsubscribeUrl).searchParams.get("token");
    expect(new URL(templateInput.confirmUrl).origin).toBe("https://atomic.example");
    expect(confirmationToken).toMatch(/^newsletter\.confirm\.v2\./);
    expect(unsubscribeToken).toMatch(/^newsletter\.unsubscribe\.v2\./);
    expect(confirmationToken).not.toBe(unsubscribeToken);

expect(insertedValues[0].token).toBeNull();
    expect(insertedValues[0].confirmationTokenHash).toBe(sha256(confirmationToken!));
    expect(insertedValues[0].unsubscribeTokenHash).toBe(sha256(unsubscribeToken!));
    expect(insertedValues[0].confirmationTokenExpiresAt).toBeInstanceOf(Date);
    expect((insertedValues[0].confirmationTokenExpiresAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(insertedValues[0])).not.toContain(confirmationToken!);
    expect(JSON.stringify(insertedValues[0])).not.toContain(unsubscribeToken!);

    const auditPayload = auditMocks.logAuditEvent.mock.calls[0][0];
    expect(JSON.stringify(auditPayload)).not.toContain("reader@example.com");
    expect(smtpMocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("validates an organization before persisting a subscriber", async () => {
    selectResults.push([]);

    await expect(
      blogNewsletterService.subscribe({
        email: "reader@example.com",
        locale: "en",
        organizationId: "missing-organization",
      }),
    ).rejects.toBeInstanceOf(NewsletterOrganizationNotFoundError);

    expect(tx.insert).not.toHaveBeenCalled();
    expect(smtpMocks.sendEmail).not.toHaveBeenCalled();
  });

  it("resubscription resets timestamps and token consumption state", async () => {
    selectResults.push([{ id: "organization-1" }], [{ id: "subscriber-1" }]);
    txUpdateResults.push([{ id: "subscriber-1" }]);

    await blogNewsletterService.subscribe({
      email: "reader@example.com",
      locale: "es",
      organizationId: "organization-1",
    });

    expect(txSets[0]).toMatchObject({
      locale: "es",
      status: "PENDING",
      confirmedAt: null,
      unsubscribedAt: null,
      tokenUsedAt: null,
    });
    expect(smtpMocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("persists the pending row, audits, and raises an operational SMTP failure", async () => {
    selectResults.push([]);
    insertResults.push([{ id: "subscriber-1" }]);
    smtpMocks.sendEmail.mockRejectedValueOnce(
      Object.assign(new Error("provider rejected"), { code: "ECONNREFUSED" }),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      blogNewsletterService.subscribe({
        email: "reader@example.com",
        locale: "fr",
        organizationId: null,
      }),
    ).rejects.toBeInstanceOf(NewsletterDeliveryError);

    expect(insertedValues).toHaveLength(1);
    expect(auditMocks.logAuditEvent).toHaveBeenCalledTimes(2);
    expect(auditMocks.logAuditEvent.mock.calls[1][0]).toMatchObject({
      action: "EMAIL_SEND_FAILED",
      resourceId: "subscriber-1",
      metadata: { purpose: "newsletter-confirmation" },
    });
    expect(JSON.stringify(auditMocks.logAuditEvent.mock.calls)).not.toContain(
      "reader@example.com",
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[newsletter] Confirmation delivery failed",
      expect.not.objectContaining({ email: expect.anything() }),
    );
  });

  it("never falls back to a request-derived origin", async () => {
    vi.stubEnv("SITE_URL", "");

    await expect(
      blogNewsletterService.subscribe({
        email: "reader@example.com",
        locale: "fr",
        organizationId: null,
        configuredSite: null,
      }),
    ).rejects.toBeInstanceOf(NewsletterConfigurationError);

    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });

  it("atomically confirms only a pending, unused, unexpired v2 token", async () => {
    rootUpdateResults.push([
      { id: "subscriber-1", organizationId: "organization-1" },
    ]);
    const token = `newsletter.confirm.v2.${"a".repeat(43)}`;

    const result = await blogNewsletterService.confirm({ token });

    expect(result).toEqual({ consumed: true });
expect(rootSets[0]).toMatchObject({
      status: "CONFIRMED",
      unsubscribedAt: null,
      confirmationTokenHash: sha256(token),
    });
    expect(rootSets[0].confirmedAt).toBeInstanceOf(Date);
    expect(rootSets[0].confirmationTokenUsedAt).toBeInstanceOf(Date);
    expect(rootSets[0]).not.toHaveProperty("tokenUsedAt");

    const compiled = new PgDialect().sqlToQuery(rootWhere[0] as any);
expect(compiled.sql).toContain('"confirmation_token_hash" =');
    expect(compiled.sql).toContain('"confirmation_token_used_at" is null');
    expect(compiled.sql).toContain('"confirmation_token_expires_at" >=');
    expect(auditMocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BLOG_NEWSLETTER_CONFIRM",
        resourceId: "subscriber-1",
      }),
    );
  });

  it("rejects a purpose-confused token before touching the database", async () => {
    const result = await blogNewsletterService.confirm({
      token: `newsletter.unsubscribe.v2.${"a".repeat(43)}`,
    });

    expect(result).toEqual({ consumed: false });
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it("explicitly rotates a legacy confirmation token to a hashed unsubscribe token", async () => {
    rootUpdateResults.push([{ id: "subscriber-1", organizationId: null }]);

    const result = await blogNewsletterService.confirm({ token: "legacy-token" });

    expect(result).toEqual({ consumed: true });
expect(rootSets[0]).toMatchObject({
      token: null,
      unsubscribeTokenHash: sha256("legacy-token"),
      unsubscribeTokenUsedAt: null,
    });
    expect(rootSets[0].tokenUsedAt).toBeInstanceOf(Date);
  });

  it("consumes unsubscribe atomically while preserving confirmation history", async () => {
    rootUpdateResults.push([{ id: "subscriber-1", organizationId: null }]);
    const token = `newsletter.unsubscribe.v2.${"b".repeat(43)}`;

    const result = await blogNewsletterService.unsubscribe({ token });

    expect(result).toEqual({ consumed: true });
expect(rootSets[0]).toMatchObject({
      status: "UNSUBSCRIBED",
      token: null,
      unsubscribeTokenHash: sha256(token),
    });
    expect(rootSets[0].unsubscribeTokenUsedAt).toBeInstanceOf(Date);
    expect(rootSets[0].unsubscribedAt).toBeInstanceOf(Date);
    expect(rootSets[0]).not.toHaveProperty("tokenUsedAt");
    expect(rootSets[0]).not.toHaveProperty("confirmedAt");

    const compiled = new PgDialect().sqlToQuery(rootWhere[0] as any);
    expect(compiled.sql).toContain('"unsubscribe_token_hash" =');
    expect(compiled.sql).toContain('"unsubscribe_token_used_at" is null');
    expect(compiled.sql).toContain('"status" =');
  });
});
