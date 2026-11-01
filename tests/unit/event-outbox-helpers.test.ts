import { describe, expect, it, vi } from "vitest";
import { Effect } from "effect";

const rollback = new Error("rollback");
vi.mock("@database/drizzle", () => ({
  getDrizzle: () => ({
    transaction: async (fn: (tx: object) => Promise<unknown>) => fn({}),
  }),
}));

import { afterCommit, dbTransaction } from "@/lib/effect/transaction";
import { crossesLowStock } from "@/modules/logistics/services/low-stock";
import { subscriptionEventFor } from "@/modules/subscriptions/services/state";

describe("crossesLowStock", () => {
  it("ne déclenche que sur le franchissement descendant", () => {
    expect(crossesLowStock(5, 6, 5)).toBe(true);
    expect(crossesLowStock(5, 10, 0)).toBe(true);
    expect(crossesLowStock(5, 5, 4)).toBe(false);
    expect(crossesLowStock(5, 4, 6)).toBe(false);
    expect(crossesLowStock(5, 10, 6)).toBe(false);
    expect(crossesLowStock(0, 1, 0)).toBe(true);
  });
  it("seuil null : jamais d'alerte", () => {
    expect(crossesLowStock(null, 10, 0)).toBe(false);
  });
});

describe("subscriptionEventFor", () => {
  type Row = Parameters<typeof subscriptionEventFor>[0];
  const base = { status: "active", planId: "p1", priceId: "pr1", cancelAtPeriodEnd: false, currentPeriodEnd: new Date("2026-01-01") } as unknown as Row;
  const w = (patch: Partial<Record<keyof Row, unknown>>) => ({ ...base, ...patch }) as Row;
  it("created à la sortie de incomplete", () => expect(subscriptionEventFor(w({ status: "incomplete" }), base)).toBe("subscription.created"));
  it("canceled une seule fois", () => {
    expect(subscriptionEventFor(base, w({ status: "cancelled" }))).toBe("subscription.canceled");
    expect(subscriptionEventFor(w({ status: "cancelled" }), w({ status: "cancelled" }))).toBeNull();
  });
  it("updated sur changement significatif", () => {
    expect(subscriptionEventFor(base, w({ planId: "p2" }))).toBe("subscription.updated");
    expect(subscriptionEventFor(base, w({ cancelAtPeriodEnd: true }))).toBe("subscription.updated");
    expect(subscriptionEventFor(base, w({ currentPeriodEnd: new Date("2026-02-01") }))).toBe("subscription.updated");
  });
  it("null sans changement ou si encore incomplete", () => {
    expect(subscriptionEventFor(base, w({ currentPeriodEnd: new Date("2026-01-01") }))).toBeNull();
    expect(subscriptionEventFor(w({ status: "incomplete" }), w({ status: "incomplete", planId: "p2" }))).toBeNull();
  });
});

describe("afterCommit", () => {
  it("exécute les hooks après COMMIT", async () => {
    const seen: string[] = [];
    const out = await Effect.runPromise(
      dbTransaction("t", (tx) => afterCommit(tx, Effect.sync(() => seen.push("hook"))).pipe(Effect.andThen(Effect.sync(() => { seen.push("body"); return 1; })))),
    );
    expect(out).toBe(1);
    expect(seen).toEqual(["body", "hook"]);
  });
  it("abandonne les hooks sur ROLLBACK", async () => {
    const seen: string[] = [];
    const exit = await Effect.runPromiseExit(
      dbTransaction("t", (tx) => afterCommit(tx, Effect.sync(() => seen.push("hook"))).pipe(Effect.andThen(Effect.fail(rollback)))),
    );
    expect(exit._tag).toBe("Failure");
    expect(seen).toEqual([]);
  });
  it("une erreur de hook n'altère pas le résultat validé", async () => {
    const out = await Effect.runPromise(dbTransaction("t", (tx) => afterCommit(tx, Effect.fail("boom")).pipe(Effect.as("ok"))));
    expect(out).toBe("ok");
  });
});
