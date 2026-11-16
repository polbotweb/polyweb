/**
 * Petites annonces (base réelle) : seed, cycle de vie, FTS et filtres, héritage d'attributs,
 * contact vendeur malgré la préférence « personne », blocages honorés, expiration.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
vi.mock("astro:actions", () => ({ ActionError: class extends Error { code: string; constructor(o: any) { super(o.message); this.code = o.code; } }, defineAction: (d: any) => d }));

import { Effect } from "effect";
import { eq, inArray } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { member, messagingBlocks, organization, sites, user } from "@database/schemas";
import { classifiedAds } from "@/modules/classifieds/schema";
import { registerModerationTargets } from "@/modules/moderation";
import { registerModuleNotifications } from "@/modules/notifications";
import { ensureSiteClassifieds } from "@/modules/classifieds/services/seed";
import { createAd, approveAd } from "@/modules/classifieds/services/ad.service";
import { startInquiry } from "@/modules/classifieds/services/inquiry";
import { expireDueAds } from "@/modules/classifieds/services/expire";
import { categoryTree, flattenTree, ancestryIds } from "@/modules/classifieds/services/categories";
import { listPublicAds, parseListQuery } from "@/modules/classifieds/services/list";
import { listDefinitions } from "@/core/attributes";
import { ATTRIBUTE_OWNER } from "@/modules/classifieds/domain/rules";
import { updateSiteSettings } from "@/modules/classifieds/services/settings";
import { setMessagingPreference } from "@/core/messaging/service";
import { resetRateLimiter } from "@/lib/rate-limit";

const tag = `cl${Date.now()}`;
const id = (n: number) => `${tag}-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADMIN = id(1), SELLER = id(2), BUYER = id(3), STRANGER = id(4);
const ORG = id(10), SITE = id(11);
const db = () => getDrizzle();
const viewer = (uid: string | null) => (uid ? { id: uid, role: uid === ADMIN ? "admin" : "user", banned: false } : null);
const err = async (p: Promise<unknown>) => p.then(() => null, (e: any) => ({ code: e.code ?? e._tag, message: e.message }));
const pgCode = (e: unknown): string | undefined => { for (let c: unknown = e; c && typeof c === "object"; c = (c as { cause?: unknown }).cause) { const code = (c as { code?: unknown }).code; if (typeof code === "string") return code; } return undefined; };
/** Réessaie si un test de migration concurrent (DROP/LOCK ACCESS EXCLUSIVE sur user/organization) nous désigne victime (40P01) ou expire le verrou (55P03). */
const retryDeadlock = async <T>(fn: () => Promise<T>, attempts = 5): Promise<T> => {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i < attempts && ["40P01", "55P03"].includes(pgCode(e) ?? "")) {
        await new Promise((r) => setTimeout(r, 150 * i));
        continue;
      }
      throw e;
    }
  }
};
const run = <T>(e: Effect.Effect<T, unknown>) => retryDeadlock(() => Effect.runPromise(e) as Promise<T>);

beforeAll(async () => {
  registerModerationTargets();
  registerModuleNotifications();
  await retryDeadlock(() => db().transaction(async (tx) => {
    await tx.insert(user).values([
      { id: ADMIN, name: "Admin", email: `${tag}a@t.test`, emailVerified: true, role: "admin", username: `${tag}admin` },
      { id: SELLER, name: "Seller", email: `${tag}s@t.test`, emailVerified: true, username: `${tag}seller` },
      { id: BUYER, name: "Buyer", email: `${tag}b@t.test`, emailVerified: true, username: `${tag}buyer` },
      { id: STRANGER, name: "Stranger", email: `${tag}x@t.test`, emailVerified: true, username: `${tag}out` },
    ] as any);
    await tx.insert(organization).values({ id: ORG, name: "Org", slug: `${tag}-org`, createdAt: new Date() } as any);
    await tx.insert(member).values([
      { id: id(20), organizationId: ORG, userId: ADMIN, role: "owner", createdAt: new Date() },
      { id: id(21), organizationId: ORG, userId: SELLER, role: "member", createdAt: new Date() },
    ] as any);
    await tx.insert(sites).values({ id: SITE, slug: `${tag}-s`, name: "Site CL", organizationId: ORG } as any);
  }));
});
beforeEach(() => resetRateLimiter());
afterAll(async () => {
  await retryDeadlock(() => db().transaction(async (tx) => {
    await tx.delete(messagingBlocks).where(inArray(messagingBlocks.blockerId, [ADMIN, SELLER, BUYER, STRANGER]));
    await tx.delete(classifiedAds).where(eq(classifiedAds.siteId, SITE));
    await tx.delete(sites).where(eq(sites.id, SITE));
    await tx.delete(member).where(eq(member.organizationId, ORG));
    await tx.delete(organization).where(eq(organization.id, ORG));
    await tx.delete(user).where(inArray(user.id, [ADMIN, SELLER, BUYER, STRANGER]));
  }));
});

describe("classifieds — module", () => {
  it("seed, héritage, cycle de vie, FTS, contact malgré préférence, blocage, expiration", async () => {
    const seeded = await run(ensureSiteClassifieds({ siteId: SITE, organizationId: ORG }));
    expect(seeded).toBe(true);
    expect(await run(ensureSiteClassifieds({ siteId: SITE, organizationId: ORG }))).toBe(false);

    const tree = await run(categoryTree(SITE, "fr"));
    const flat = flattenTree(tree);
    expect(flat.length).toBe(34);
    const dons = flat.find((c) => c.slug === "dons");
    const locations = flat.find((c) => c.slug === "locations");
    expect(dons && locations).toBeTruthy();
    const inherited = await run(listDefinitions("classifieds", ATTRIBUTE_OWNER, await run(ancestryIds(SITE, locations!.id))));
    expect(inherited.map((d) => d.key)).toEqual(expect.arrayContaining(["type_bien", "surface"]));

    await run(updateSiteSettings({ siteId: SITE, organizationId: ORG }, ADMIN, {
      visibility: "public", preModeration: true, durationDays: 30, defaultCurrency: "EUR", maxImages: 8, maxRenewals: 3,
    }));

    const token = `zephyr${tag}`;
    const created = await run(createAd(SITE, viewer(SELLER), {
      categoryId: dons!.id, title: `Canapé ${token}`, body: `Un canapé confortable ${token} en excellent état.`,
      kind: "wanted", condition: "n_a", priceKind: "free", city: "Lyon", postalCode: "69001", country: "FR",
      media: [], attributes: [], submit: true,
    }));
    const [pending] = await retryDeadlock(() => db().select().from(classifiedAds).where(eq(classifiedAds.id, created.id)));
    expect(pending.lifecycle).toBe("pending");

    const listedPending = await run(listPublicAds(SITE, null, tree, parseListQuery(new URLSearchParams(`q=${token}`))));
    expect(listedPending.total).toBe(0);

    await run(approveAd(created.id, viewer(ADMIN)));
    const published = await run(listPublicAds(SITE, null, tree, parseListQuery(new URLSearchParams(`q=${token}`))));
    expect(published.total).toBe(1);
    expect(published.items[0]?.title).toContain("Canapé");

    const byCity = await run(listPublicAds(SITE, null, tree, parseListQuery(new URLSearchParams("city=Lyon"))));
    expect(byCity.items.some((a) => a.id === created.id)).toBe(true);

    await run(setMessagingPreference(SELLER, "nobody"));
    const sent = await run(startInquiry(created.id, viewer(BUYER), "Bonjour, toujours dispo ?"));
    expect(sent).toBeTruthy();

    const blocked = await err(run(startInquiry(created.id, viewer(STRANGER), "Hello")));
    await retryDeadlock(() => db().insert(messagingBlocks).values({ blockerId: SELLER, blockedId: STRANGER }));
    const afterBlock = await err(run(startInquiry(created.id, viewer(STRANGER), "Hello encore")));
    expect(afterBlock).toBeTruthy();
    void blocked;

    await retryDeadlock(() => db().update(classifiedAds).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(classifiedAds.id, created.id)));
    const n = await run(expireDueAds());
    expect(n).toBeGreaterThanOrEqual(1);
    const [expired] = await retryDeadlock(() => db().select().from(classifiedAds).where(eq(classifiedAds.id, created.id)));
    expect(expired.lifecycle).toBe("expired");
    const gone = await run(listPublicAds(SITE, null, tree, parseListQuery(new URLSearchParams(`q=${token}`))));
    expect(gone.total).toBe(0);
  });
});
