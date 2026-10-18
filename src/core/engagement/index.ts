export type EngagementCapability = "comments" | "reviews" | "reactions" | "favorites" | "reports";

export type EngagementSubject =
  | { readonly kind: "post"; readonly id: string }
  | { readonly kind: "comment"; readonly id: string }
  | { readonly kind: "review"; readonly id: string };

export function assertEngagementSubject(subject: EngagementSubject): void {
  if (!subject.id.trim()) throw new Error("Engagement subject id cannot be empty");
}
