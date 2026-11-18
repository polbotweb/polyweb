import { describe, it, expect } from "vitest";
import { adModerationTransition, canRenew, canViewAd, canViewBoard, clampPage, defaultCondition, expiresAtFrom, isPubliclyListed, slugifyAd, submitLifecycle } from "@/modules/classifieds/domain/rules";
import { canTransition } from "@/modules/classifieds/domain/workflow";
import { flattenCategories, DEFAULT_CLASSIFIED_CATEGORIES } from "@/modules/classifieds/domain/defaults";

describe("classifieds — visibilité", () => {
  const board = { visibility: "public" as const, signedIn: false, orgMember: false, manager: false };
  it("tableau public / membres / organisation ; gestionnaire toujours", () => {
    expect(canViewBoard(board)).toBe(true);
    expect(canViewBoard({ ...board, visibility: "members" })).toBe(false);
    expect(canViewBoard({ ...board, visibility: "members", signedIn: true })).toBe(true);
    expect(canViewBoard({ ...board, visibility: "org", signedIn: true })).toBe(false);
    expect(canViewBoard({ ...board, visibility: "org", signedIn: true, orgMember: true })).toBe(true);
    expect(canViewBoard({ ...board, visibility: "org", manager: true })).toBe(true);
  });

  it("fiche : publiée visible, ou auteur / gestionnaire", () => {
    const ad = { boardVisible: true, lifecycle: "published" as const, moderationStatus: "visible" as const, isAuthor: false, manager: false };
    expect(canViewAd(ad)).toBe(true);
    expect(canViewAd({ ...ad, lifecycle: "draft" })).toBe(false);
    expect(canViewAd({ ...ad, lifecycle: "draft", isAuthor: true })).toBe(true);
    expect(canViewAd({ ...ad, moderationStatus: "hidden" })).toBe(false);
    expect(canViewAd({ ...ad, moderationStatus: "hidden", manager: true })).toBe(true);
    expect(isPubliclyListed("published", "visible")).toBe(true);
    expect(isPubliclyListed("expired", "visible")).toBe(false);
  });

  it("transitions de modération idempotentes", () => {
    expect(adModerationTransition("visible", "hide")).toBe("hidden");
    expect(adModerationTransition("hidden", "hide")).toBeNull();
    expect(adModerationTransition("visible", "spam")).toBe("spam");
    expect(adModerationTransition("spam", "restore")).toBe("visible");
    expect(adModerationTransition("visible", "restore")).toBeNull();
  });
});

describe("classifieds — cycle de vie", () => {
  it("soumission selon la pré-modération", () => {
    expect(submitLifecycle(true)).toBe("pending");
    expect(submitLifecycle(false)).toBe("published");
  });
  it("renouvellement : publiée ou expirée, sous le plafond", () => {
    expect(canRenew("published", 0, 3)).toBe(true);
    expect(canRenew("published", 3, 3)).toBe(false);
    expect(canRenew("expired", 1, 3)).toBe(true);
    expect(canRenew("draft", 0, 3)).toBe(false);
    expect(canTransition("expired", "published")).toBe(true);
    expect(canTransition("sold", "published")).toBe(false);
  });
  it("slug, pagination, expiration, état par défaut", () => {
    expect(slugifyAd("Canapé d'angle !")).toBe("canape-d-angle");
    expect(slugifyAd("@@@")).toBe("annonce");
    expect(clampPage(0, 50, 20)).toBe(1);
    expect(clampPage(9, 50, 20)).toBe(3);
    const now = new Date("2026-01-01T00:00:00Z");
    expect(expiresAtFrom(now, 30).getTime()).toBe(now.getTime() + 30 * 86_400_000);
    expect(defaultCondition("emploi")).toBe("n_a");
    expect(defaultCondition("vehicules")).toBe("used");
  });
});

describe("classifieds — arbre seedé", () => {
  it("34 nœuds, feuilles uniques, attributs d'immobilier hérités", () => {
    const flat = flattenCategories(DEFAULT_CLASSIFIED_CATEGORIES);
    expect(flat).toHaveLength(34);
    const slugs = flat.map((r) => r.node.slug);
    expect(new Set(slugs).size).toBe(34);
    expect(flat.some((r) => r.node.slug === "voitures" && r.parentSlug === "vehicules")).toBe(true);
    const immo = DEFAULT_CLASSIFIED_CATEGORIES.find((c) => c.slug === "immobilier");
    expect(immo?.attributes?.some((a) => a.key === "surface" && a.filterable)).toBe(true);
    expect(immo?.attributes?.some((a) => a.key === "type_bien" && a.required)).toBe(true);
  });
});
