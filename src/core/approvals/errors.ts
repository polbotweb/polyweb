/** Erreurs du moteur d'approbation générique (core/approvals). */
import { Data } from "effect";

export class InvalidApprovalPolicyError extends Data.TaggedError("InvalidApprovalPolicyError")<{
  readonly field: string;
  readonly value: string;
}> {
  override get message() {
    return `Politique d'approbation invalide (${this.field}) : ${this.value}`;
  }
}

export class ApprovalNotRequiredError extends Data.TaggedError("ApprovalNotRequiredError")<{
  readonly resourceType: string;
  readonly resourceId: string;
}> {
  override get message() {
    return `Aucune approbation requise pour ${this.resourceType} ${this.resourceId}.`;
  }
}

export class ApprovalPendingError extends Data.TaggedError("ApprovalPendingError")<{
  readonly requestId: string;
  readonly level: number;
}> {
  override get message() {
    return `Approbation en attente (demande ${this.requestId}, niveau ${this.level}).`;
  }
}

export class ApprovalRejectedError extends Data.TaggedError("ApprovalRejectedError")<{
  readonly requestId: string;
}> {
  override get message() {
    return `Demande d'approbation rejetée (${this.requestId}).`;
  }
}

export class ApprovalDecisionError extends Data.TaggedError("ApprovalDecisionError")<{
  readonly reason: "status" | "level" | "role" | "already";
  readonly value: string;
}> {
  override get message() {
    return `Décision d'approbation refusée (${this.reason}) : ${this.value}`;
  }
}
