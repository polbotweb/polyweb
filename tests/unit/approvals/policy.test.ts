import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { actorSatisfies, applyDecision, approvalRequired, requiredBands, validatePolicy } from "@/core/approvals/policy";
import { DEFAULT_APPROVAL_POLICY, type ApprovalActor, type ApprovalBand, type ApprovalPolicy } from "@/core/approvals/types";

const admin: ApprovalActor = { userId: "u1", isPlatformAdmin: false, organizationRole: "orgAdmin", permissions: ["purchasing:approve"] };
const member: ApprovalActor = { userId: "u2", isPlatformAdmin: false, organizationRole: "orgMember", permissions: [] };
const owner: ApprovalActor = { userId: "u3", isPlatformAdmin: false, organizationRole: "orgOwner", permissions: ["purchasing:approve"] };

const bands: ApprovalBand[] = [
  { level: 1, minMinor: 10_000, maxMinor: null, requiredRole: "orgAdmin", requiredPermission: "purchasing:approve" },
  { level: 2, minMinor: 100_000, maxMinor: null, requiredRole: "orgOwner", requiredPermission: "purchasing:approve" },
];

const bandPolicy: ApprovalPolicy = { mode: "bands", thresholdMinor: 0, currency: "EUR", bands };

describe("core/approvals", () => {
  it("n'exige rien en mode none (défaut)", () => {
    expect(approvalRequired(DEFAULT_APPROVAL_POLICY, 1_000_000)).toBe(false);
    expect(requiredBands(DEFAULT_APPROVAL_POLICY, 50).length).toBe(0);
  });

  it("n'exige une approbation au seuil unique qu'au-delà du montant", () => {
    const policy: ApprovalPolicy = { mode: "single_threshold", thresholdMinor: 50_000, currency: "EUR", bands: [] };
    expect(approvalRequired(policy, 49_999)).toBe(false);
    expect(requiredBands(policy, 50_000)).toHaveLength(1);
    expect(requiredBands(policy, 50_000)[0]?.requiredRole).toBe("orgAdmin");
  });

  it("enchaîne les paliers dont la fourchette couvre le montant", () => {
    expect(requiredBands(bandPolicy, 9_999)).toHaveLength(0);
    expect(requiredBands(bandPolicy, 10_000).map((b) => b.level)).toEqual([1]);
    expect(requiredBands(bandPolicy, 99_999).map((b) => b.level)).toEqual([1]);
    expect(requiredBands(bandPolicy, 100_000).map((b) => b.level)).toEqual([1, 2]);
  });

  it("reconnaît la hiérarchie des rôles (owner ≥ admin ≥ member)", () => {
    const band = bands[0]!;
    expect(actorSatisfies(member, band)).toBe(false);
    expect(actorSatisfies(admin, band)).toBe(true);
    expect(actorSatisfies(owner, band)).toBe(true);
    expect(actorSatisfies({ ...admin, permissions: [] }, band)).toBe(false);
    expect(actorSatisfies({ userId: "a", isPlatformAdmin: true, organizationRole: null, permissions: [] }, band)).toBe(true);
  });

  it("applique une décision sur le palier courant puis clôture ou enchaîne", async () => {
    const steps = [
      { level: 1, status: "PENDING" as const, requiredRole: "orgAdmin" as const, requiredPermission: "purchasing:approve" },
      { level: 2, status: "WAITING" as const, requiredRole: "orgOwner" as const, requiredPermission: "purchasing:approve" },
    ];
    const first = await Effect.runPromise(applyDecision(steps, admin, "APPROVED"));
    expect(first.status).toBe("PENDING");
    expect(first.steps[0]?.status).toBe("APPROVED");
    expect(first.steps[1]?.status).toBe("PENDING");
    const second = await Effect.runPromise(applyDecision(first.steps, owner, "APPROVED"));
    expect(second.status).toBe("APPROVED");
  });

  it("un rejet clôture la demande et saute les paliers suivants", async () => {
    const steps = [
      { level: 1, status: "PENDING" as const, requiredRole: "orgAdmin" as const, requiredPermission: null },
      { level: 2, status: "WAITING" as const, requiredRole: "orgOwner" as const, requiredPermission: null },
    ];
    const result = await Effect.runPromise(applyDecision(steps, admin, "REJECTED"));
    expect(result.status).toBe("REJECTED");
    expect(result.steps[1]?.status).toBe("SKIPPED");
  });

  it("conserve les paliers saisis même si le mode n'est pas bands", async () => {
    const kept = await Effect.runPromise(validatePolicy({ mode: "none", thresholdMinor: 0, currency: "EUR", bands }));
    expect(kept.bands).toHaveLength(2);
  });

  it("refuse une politique de paliers vide ou incohérente", async () => {
    const empty = await Effect.runPromiseExit(validatePolicy({ mode: "bands", thresholdMinor: 0, currency: "EUR", bands: [] }));
    expect(empty._tag).toBe("Failure");
    const ok = await Effect.runPromise(validatePolicy(bandPolicy));
    expect(ok.bands).toHaveLength(2);
  });
});
