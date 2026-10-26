import { Data } from "effect";

export class InvalidOpportunityError extends Data.TaggedError("InvalidOpportunityError")<{ readonly field: "amount" | "probability" | "currency" | "lostReason" | "expectedCloseDate"; readonly value: string }> {
  override get message() {
    return `Opportunité invalide (${this.field}) : ${this.value}`;
  }
}

export class InvalidContactError extends Data.TaggedError("InvalidContactError")<{ readonly field: "name" | "email" | "phone" | "website" | "country"; readonly value: string }> {
  override get message() {
    return `Contact invalide (${this.field}) : ${this.value}`;
  }
}

export class InvalidActivityError extends Data.TaggedError("InvalidActivityError")<{ readonly field: "subject" | "kind" | "dueAt" | "target"; readonly value: string }> {
  override get message() {
    return `Activité invalide (${this.field}) : ${this.value}`;
  }
}
