export type PresentationKind = "card" | "list" | "single" | "ui";

export interface PresentationDefinition {
  readonly kind: PresentationKind;
  readonly variant: string;
}

export function assertPresentationDefinition(definition: PresentationDefinition): void {
  if (!definition.variant.trim()) throw new Error("Presentation variant cannot be empty");
}
