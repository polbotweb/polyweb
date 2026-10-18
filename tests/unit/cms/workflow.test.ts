import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, type WorkflowDefinition } from "@/lib/cms/workflow";

type State = "DRAFT" | "PUBLISHED" | "ARCHIVED" | "DELETED";

const workflow: WorkflowDefinition<State> = {
  states: ["DRAFT", "PUBLISHED", "ARCHIVED", "DELETED"],
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "DRAFT", to: "DELETED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "DELETED" },
    { from: "ARCHIVED", to: "DRAFT" },
    { from: "ARCHIVED", to: "DELETED" },
    { from: "DELETED", to: "DRAFT" },
  ],
};

describe("cms workflow", () => {
  it("accepts legal transitions", () => {
    expect(canTransition(workflow, "DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransition(workflow, "PUBLISHED", "DRAFT")).toBe(true);
    expect(canTransition(workflow, "DELETED", "DRAFT")).toBe(true);
  });

  it("rejects undeclared self-transitions", () => {
    expect(canTransition(workflow, "DRAFT", "DRAFT")).toBe(false);
    expect(() => assertTransition(workflow, "DRAFT", "DRAFT")).toThrow(
      "Invalid workflow transition: DRAFT -> DRAFT",
    );
  });

  it("rejects illegal direct publishing", () => {
    expect(canTransition(workflow, "ARCHIVED", "PUBLISHED")).toBe(false);
    expect(canTransition(workflow, "DELETED", "PUBLISHED")).toBe(false);
  });

  it("throws on an illegal transition", () => {
    expect(() => assertTransition(workflow, "DELETED", "PUBLISHED")).toThrow(
      "Invalid workflow transition: DELETED -> PUBLISHED",
    );
  });
});
