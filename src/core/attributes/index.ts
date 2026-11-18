/**
 * Attributs dynamiques typés (core). Contrat de validation historique conservé ;
 * la persistance générique (`schema`, `service`, `validation`) est le chemin à suivre.
 * L'EAV du module services n'est pas migré dans cette livraison.
 */
export type AttributeValueKind = "text" | "number" | "boolean" | "date" | "select" | "multi-select";

export interface AttributeDefinition {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly kind: AttributeValueKind;
  readonly required?: boolean;
  readonly options?: readonly string[];
}

export interface AttributeValue {
  readonly definitionId: string;
  readonly value: string | number | boolean | Date | readonly string[] | null;
}

export function assertAttributeDefinition(definition: AttributeDefinition): void {
  if (!definition.id.trim() || !definition.key.trim()) throw new Error("Attribute definition requires id and key");
  if (definition.kind === "select" || definition.kind === "multi-select") {
    if (!definition.options || definition.options.length === 0) throw new Error(`Attribute ${definition.id} requires options`);
  }
}

export * from "./kinds";
export * from "./schema";
export * from "./validation";
export * from "./service";
