import { beforeEach, describe, expect, it, vi } from "vitest";

const serviceMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/newsletter/blog-newsletter-service", () => ({
  blogNewsletterService: serviceMocks,
}));
vi.mock("@/lib/audit", () => ({
  extractIp: vi.fn(() => "203.0.113.10"),
}));

import { GET as confirmNewsletter } from "@/pages/api/blog/newsletter/confirm";
import { GET as unsubscribeNewsletter } from "@/pages/api/blog/newsletter/unsubscribe";

function routeContext(path: string) {
  const url = new URL(path, "https://atomic.example");
  return {
    url,
    request: new Request(url, {
      headers: { "user-agent": "newsletter-route-test" },
    }),
    clientAddress: "203.0.113.10",
    site: new URL("https://atomic.example"),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceMocks.confirm.mockResolvedValue({ consumed: true });
  serviceMocks.unsubscribe.mockResolvedValue({ consumed: true });
});

describe("blog newsletter HTTP routes", () => {
  it("uses the shared service to confirm a token", async () => {
    const response = await confirmNewsletter(
      routeContext("/api/blog/newsletter/confirm?token=legacy-token"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(serviceMocks.confirm).toHaveBeenCalledWith({
      token: "legacy-token",
      audit: {
        ipAddress: "203.0.113.10",
        userAgent: "newsletter-route-test",
      },
    });
  });

  it("returns the same invalid response for unknown or consumed confirmation tokens", async () => {
    serviceMocks.confirm.mockResolvedValueOnce({ consumed: false });

    const response = await confirmNewsletter(
      routeContext("/api/blog/newsletter/confirm?token=unknown"),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("invalide ou expiré");
  });

  it("rejects an untrusted request origin before token consumption", async () => {
    const context = routeContext(
      "https://attacker.invalid/api/blog/newsletter/confirm?token=legacy-token",
    );

    const response = await confirmNewsletter(context);

    expect(response.status).toBe(400);
    expect(serviceMocks.confirm).not.toHaveBeenCalled();
  });

  it("turns service failures into an operationally visible 503", async () => {
    serviceMocks.confirm.mockRejectedValueOnce(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await confirmNewsletter(
      routeContext("/api/blog/newsletter/confirm?token=legacy-token"),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("database unavailable");
  });

  it("uses the shared service to unsubscribe a token", async () => {
    const response = await unsubscribeNewsletter(
      routeContext("/api/blog/newsletter/unsubscribe?token=legacy-token"),
    );

    expect(response.status).toBe(200);
    expect(serviceMocks.unsubscribe).toHaveBeenCalledWith({
      token: "legacy-token",
      audit: {
        ipAddress: "203.0.113.10",
        userAgent: "newsletter-route-test",
      },
    });
  });
});
