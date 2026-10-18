import { describe, expect, it, beforeEach } from "vitest";
import { clearModuleRegistryForTests, getModule, listModules, registerModule } from "@/lib/cms/module-registry";

const moduleA = {
  id: "module-a",
  entity: "entity_a",
  capabilities: {
    content: false,
    attributes: false,
    localization: false,
    media: false,
    seo: false,
    taxonomy: false,
    search: false,
    publication: false,
    revisions: false,
    locks: false,
    engagement: false,
    moderation: false,
    notifications: false,
    audit: true,
    cache: false,
  },
  capabilityProviders: {
    attributes: "attributes",
    content: "content",
    localization: "localization",
    media: "media",
    seo: "seo",
    taxonomy: "taxonomy",
    search: "search",
    publication: "publication",
    revisions: "revisions",
    locks: "locks",
    engagement: "engagement",
    moderation: "moderation",
    notifications: "notifications",
    audit: "audit",
    cache: "cache",
  },
  presentations: { card: ["default"], list: ["default"], single: ["default"], ui: [] },
} as const;

describe("Atomic module registry", () => {
  beforeEach(() => clearModuleRegistryForTests());

  it("registers, retrieves and lists modules deterministically", () => {
    registerModule(moduleA);
    expect(getModule("module-a")).toEqual(moduleA);
    expect(listModules()).toEqual([moduleA]);
  });

  it("rejects duplicate module ids", () => {
    registerModule(moduleA);
    expect(() => registerModule(moduleA)).toThrow("Atomic module already registered: module-a");
  });
});
