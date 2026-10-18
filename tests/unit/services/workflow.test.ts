import { describe, expect, it } from "vitest";
import { assertServiceRevisionRestore, canRestoreServiceRevision, canTransitionService } from "@/modules/services/workflow";

const states = ["DRAFT", "PUBLISHED", "ARCHIVED", "DELETED"] as const;

describe("Services workflow", () => {
  it("allows only the declared lifecycle transitions", () => {
    expect(canTransitionService("DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransitionService("PUBLISHED", "DRAFT")).toBe(true);
    expect(canTransitionService("PUBLISHED", "ARCHIVED")).toBe(true);
    expect(canTransitionService("ARCHIVED", "DRAFT")).toBe(true);
    expect(canTransitionService("DELETED", "DRAFT")).toBe(true);
    expect(canTransitionService("DELETED", "PUBLISHED")).toBe(false);
    expect(canTransitionService("ARCHIVED", "PUBLISHED")).toBe(false);
  });

  it("permits restoration when lifecycle state stays unchanged", () => {
    for (const state of states) expect(canRestoreServiceRevision(state, state)).toBe(true);
    expect(() => assertServiceRevisionRestore("PUBLISHED", "PUBLISHED")).not.toThrow();
  });

  it("still enforces the workflow when restoring to another state", () => {
    expect(() => assertServiceRevisionRestore("DELETED", "PUBLISHED")).toThrow();
    expect(() => assertServiceRevisionRestore("ARCHIVED", "DRAFT")).not.toThrow();
  });
});
