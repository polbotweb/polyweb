import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("astro:actions", () => {
  class ActionError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  }
  return { ActionError, defineAction: (definition: unknown) => definition };
});

const serviceMocks = vi.hoisted(() => ({
  subscribe: vi.fn(),
  confirm: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/newsletter/blog-newsletter-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/newsletter/blog-newsletter-service")>();
  return { ...actual, blogNewsletterService: serviceMocks };
});

vi.mock("@/lib/audit", () => ({
  extractIp: vi.fn(() => "203.0.113.7"),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10 })),
}));
vi.mock("@i18n/config", () => ({
  LOCALES: ["fr", "en", "es", "ar"] as const,
}));

import {
  confirmBlogSubscription,
  subscribeBlogNewsletter,
  unsubscribeBlogNewsletter,
} from "@/actions/blog/subscription";
import {
  NewsletterDeliveryError,
  NewsletterOrganizationNotFoundError,
} from "@/lib/newsletter/blog-newsletter-service";

const subscribe = subscribeBlogNewsletter as unknown as {
  handler: (...args: any[]) => Promise<any>;
};
const confirm = confirmBlogSubscription as unknown as {
  handler: (...args: any[]) => Promise<any>;
};
const unsubscribe = unsubscribeBlogNewsletter as unknown as {
  handler: (...args: any[]) => Promise<any>;
};

function guestContext() {
  return {
    locals: {},
    request: new Request("https://attacker.invalid/actions", {
      headers: { "user-agent": "newsletter-test" },
    }),
    clientAddress: "203.0.113.7",
    site: new URL("https://atomic.example"),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceMocks.subscribe.mockResolvedValue(undefined);
  serviceMocks.confirm.mockResolvedValue({ consumed: true });
  serviceMocks.unsubscribe.mockResolvedValue({ consumed: true });
});

describe("blog newsletter actions", () => {
  it("delegates subscription to the shared business service with configured site", async () => {
    const result = await subscribe.handler(
      { email: "reader@example.com", locale: "fr", organizationId: null },
      guestContext(),
    );

    expect(result).toEqual({ success: true });
    expect(serviceMocks.subscribe).toHaveBeenCalledWith({
      email: "reader@example.com",
      locale: "fr",
      organizationId: null,
      configuredSite: new URL("https://atomic.example"),
      audit: {
        ipAddress: "203.0.113.7",
        userAgent: "newsletter-test",
      },
    });
  });

  it("returns a generic bad request when the organization does not exist", async () => {
    serviceMocks.subscribe.mockRejectedValueOnce(
      new NewsletterOrganizationNotFoundError(),
    );

    await expect(
      subscribe.handler(
        { email: "reader@example.com", locale: "fr", organizationId: "missing" },
        guestContext(),
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Organisation invalide.",
    });
  });

  it("surfaces SMTP failure without exposing subscriber state", async () => {
    serviceMocks.subscribe.mockRejectedValueOnce(
      new NewsletterDeliveryError(new Error("provider failure")),
    );

    await expect(
      subscribe.handler(
        { email: "reader@example.com", locale: "fr", organizationId: null },
        guestContext(),
      ),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "L'inscription n'a pas pu être finalisée. Veuillez réessayer.",
    });
  });

  it("keeps confirmation Action responses state-independent", async () => {
    serviceMocks.confirm.mockResolvedValueOnce({ consumed: false });

    const result = await confirm.handler(
      { token: "legacy-token" },
      guestContext(),
    );

    expect(result).toEqual({ success: true });
    expect(serviceMocks.confirm).toHaveBeenCalledWith({
      token: "legacy-token",
      audit: {
        ipAddress: "203.0.113.7",
        userAgent: "newsletter-test",
      },
    });
  });

  it("keeps unsubscribe Action responses state-independent", async () => {
    serviceMocks.unsubscribe.mockResolvedValueOnce({ consumed: false });

    const result = await unsubscribe.handler(
      { token: "legacy-token" },
      guestContext(),
    );

    expect(result).toEqual({ success: true });
    expect(serviceMocks.unsubscribe).toHaveBeenCalledWith({
      token: "legacy-token",
      audit: {
        ipAddress: "203.0.113.7",
        userAgent: "newsletter-test",
      },
    });
  });
});
