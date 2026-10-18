import { describe, expect, it } from "vitest";
import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";

describe("Admin resource list contract", () => {
  it("accepts the Blog-style filter and sort contract", () => {
    expect(() =>
      assertAdminResourceListDefinition({
        filters: [
          { id: "search", kind: "search", queryParam: "search" },
          { id: "status", kind: "select", queryParam: "status" },
        ],
        sorts: [{ id: "updatedAt", queryParam: "sortBy", directions: ["asc", "desc"] }],
        defaultSort: "updatedAt",
      }),
    ).not.toThrow();
  });

  it("rejects a default sort that is not declared", () => {
    expect(() =>
      assertAdminResourceListDefinition({
        sorts: [{ id: "updatedAt", queryParam: "sortBy", directions: ["asc", "desc"] }],
        defaultSort: "missing",
      }),
    ).toThrow("Unknown default admin sort");
  });
});
