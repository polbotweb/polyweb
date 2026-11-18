/** Persistance des demandes d'approbation d'une commande fournisseur (moteur core/approvals). */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { fail } from "@/lib/effect/action";
import { approvalRequests, approvalSteps } from "@/core/approvals/schema";
import { applyDecision, approvalRequired, requiredBands, type ApprovalActor, type ApprovalPolicy } from "@/core/approvals";
import { purchasing } from "../schema";
import { assignDocumentNumber } from "@/core/numbering";
import { DEFAULT_PURCHASE_ORDER_NUMBERING, PURCHASE_ORDER_NUMBERING_KEY, schemeWithPrefix } from "../domain/numbering";
import { purchasingSettingsService } from "./settings.service";
const today = () => new Date().toISOString().slice(0, 10);

const firstPending = (bands: ReturnType<typeof requiredBands>) =>
  bands.map((band, index) => ({
    level: band.level,
    requiredRole: band.requiredRole,
    requiredPermission: band.requiredPermission,
    status: index === 0 ? "PENDING" as const : "WAITING" as const,
  }));

export const openPurchaseApproval = (tx: DbTransaction, input: {
  readonly organizationId: string | null;
  readonly orderId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly requestedBy: string;
  readonly policy: ApprovalPolicy;
  readonly policyId?: string | null;
}) =>
  Effect.gen(function* () {
    const bands = requiredBands(input.policy, input.amountMinor);
    const [request] = yield* dbTry("purchasing.approval.open", () => tx.insert(approvalRequests).values({
      organizationId: input.organizationId, module: "purchasing", resourceType: "purchase_order", resourceId: input.orderId,
      policyId: input.policyId ?? null, amountMinor: input.amountMinor, currency: input.currency, status: "PENDING", requestedBy: input.requestedBy,
    }).returning());
    yield* dbTry("purchasing.approval.steps", () => tx.insert(approvalSteps).values(firstPending(bands).map((step) => ({
      requestId: request!.id, level: step.level, requiredRole: step.requiredRole, requiredPermission: step.requiredPermission, status: step.status,
    }))));
    return request!;
  });

export const approvalNeeded = (policy: ApprovalPolicy, amountMinor: number) => approvalRequired(policy, amountMinor);

export const decidePurchaseApproval = (orderId: string, actor: ApprovalActor, decision: "APPROVED" | "REJECTED", comment: string | null, actorUserId: string) =>
  dbTransaction("purchasing.approval.decide", (tx) =>
    Effect.gen(function* () {
      const [order] = yield* dbTry("purchasing.approval.order", () =>
        tx.select().from(purchasing).where(eq(purchasing.id, orderId)).limit(1).for("update"));
      if (!order) return yield* fail("NOT_FOUND", "Commande fournisseur introuvable.");
      if (order.status !== "PENDING_APPROVAL" || !order.approvalRequestId) return yield* fail("BAD_REQUEST", "Cette commande n'est pas en attente d'approbation.");
      const steps = yield* dbTry("purchasing.approval.steps.get", () =>
        tx.select().from(approvalSteps).where(eq(approvalSteps.requestId, order.approvalRequestId!)));
      const result = yield* applyDecision(steps, actor, decision).pipe(Effect.catch((error) => fail("FORBIDDEN", error.message)));
      for (const step of result.steps) {
        const previous = steps.find((row) => row.level === step.level)!;
        if (previous.status === step.status) continue;
        yield* dbTry("purchasing.approval.step", () => tx.update(approvalSteps).set({
          status: step.status,
          decidedBy: step.status === "APPROVED" || step.status === "REJECTED" ? actorUserId : previous.decidedBy,
          decidedAt: step.status === "APPROVED" || step.status === "REJECTED" ? new Date() : previous.decidedAt,
          comment: step.level === (steps.find((row) => row.status === "PENDING")?.level) ? comment : previous.comment,
        }).where(eq(approvalSteps.id, previous.id)));
      }
      const [request] = yield* dbTry("purchasing.approval.request", () =>
        tx.update(approvalRequests).set({
          status: result.status === "PENDING" ? "PENDING" : result.status,
          comment,
          decidedAt: result.status === "PENDING" ? null : new Date(),
        }).where(eq(approvalRequests.id, order.approvalRequestId!)).returning());
      if (result.status === "REJECTED") {
        const [row] = yield* dbTry("purchasing.approval.rejectOrder", () =>
          tx.update(purchasing).set({ status: "DRAFT" }).where(eq(purchasing.id, orderId)).returning());
        return { order: row!, request: request!, status: result.status };
      }
      if (result.status === "APPROVED") {
        const { settings } = yield* purchasingSettingsService.get(order.organizationId);
        const number = order.number ?? (yield* assignDocumentNumber(tx, {
          organizationId: order.organizationId, key: PURCHASE_ORDER_NUMBERING_KEY,
          scheme: schemeWithPrefix(DEFAULT_PURCHASE_ORDER_NUMBERING, settings.poPrefix), date: today(),
        }).pipe(Effect.map((row) => row.number), Effect.catch((error) => fail("BAD_REQUEST", error.message))));
        const [row] = yield* dbTry("purchasing.approval.send", () =>
          tx.update(purchasing).set({ status: "SENT", number, sentAt: new Date() }).where(eq(purchasing.id, orderId)).returning());
        return { order: row!, request: request!, status: result.status };
      }
      return { order, request: request!, status: result.status };
    }));

export const actorFromUser = (user: { readonly id: string; readonly role?: string | null }, permissions: readonly string[]): ApprovalActor => {
  const isPlatformAdmin = user.role === "admin";
  const organizationRole = user.role === "owner" || user.role === "orgOwner" ? "orgOwner" as const
    : user.role === "orgAdmin" ? "orgAdmin" as const
    : isPlatformAdmin ? null
    : "orgMember" as const;
  return { userId: user.id, isPlatformAdmin, organizationRole, permissions };
};

export { purchasingSettingsService };
