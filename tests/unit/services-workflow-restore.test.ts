import { describe, expect, it } from "vitest";
import { assertServiceRevisionRestore, canRestoreServiceRevision } from "@/modules/services/workflow";

describe("Services revision restore compatibility", () => {
  it("allows restoring content without changing lifecycle state", () => {
    expect(canRestoreServiceRevision("DRAFT", "DRAFT")).toBe(true);
    expect(canRestoreServiceRevision("PUBLISHED", "PUBLISHED")).toBe(true);
    expect(canRestoreServiceRevision("ARCHIVED", "ARCHIVED")).toBe(true);
    expect(() => assertServiceRevisionRestore("DRAFT", "DRAFT")).not.toThrow();
    expect(() => assertServiceRevisionRestore("PUBLISHED", "PUBLISHED")).not.toThrow();
  });

  it("keeps real status changes governed by the explicit workflow", () => {
    expect(canRestoreServiceRevision("ARCHIVED", "DRAFT")).toBe(true);
    expect(canRestoreServiceRevision("DELETED", "DRAFT")).toBe(true);
    expect(canRestoreServiceRevision("ARCHIVED", "PUBLISHED")).toBe(false);
    expect(canRestoreServiceRevision("DELETED", "PUBLISHED")).toBe(false);
    expect(() => assertServiceRevisionRestore("DELETED", "PUBLISHED")).toThrow();
  });
});
