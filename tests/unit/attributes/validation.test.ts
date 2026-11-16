import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { completeLocales } from "@/core/attributes/kinds";
import { validateAttributeValues, validateDefinitionDraft, type LoadedDefinition } from "@/core/attributes/validation";

const labels = completeLocales({ fr: "Année", en: "Year", es: "Año", ar: "سنة" });
const def = (patch: Partial<LoadedDefinition> = {}): LoadedDefinition => ({
  id: "d1", module: "classifieds", ownerType: "category", ownerId: "c1", key: "annee", kind: "integer",
  required: true, filterable: true, unit: null, minValue: 1950, maxValue: 2030, position: 0, labels, description: {}, options: [], ...patch,
});

const run = <A>(e: Effect.Effect<A, unknown>) => Effect.runPromise(e);

describe("attributes — validation", () => {
  it("définition : clé, libellés 4 langues, options selon le type", async () => {
    const draft = { module: "classifieds", ownerType: "category", ownerId: "c", key: "annee", kind: "integer" as const, required: true, filterable: true, labels };
    await expect(run(validateDefinitionDraft(draft))).resolves.toMatchObject({ key: "annee" });
    await expect(run(validateDefinitionDraft({ ...draft, key: "Année" }))).rejects.toMatchObject({ _tag: "AttributeValidationError" });
    await expect(run(validateDefinitionDraft({ ...draft, kind: "select", options: [] }))).rejects.toMatchObject({ field: "options" });
  });

  it("valeurs : obligatoire, bornes, options connues", async () => {
    await expect(run(validateAttributeValues([def()], [{ definitionId: "d1", number: 2010 }]))).resolves.toEqual([
      expect.objectContaining({ definitionId: "d1", numberValue: 2010 }),
    ]);
    await expect(run(validateAttributeValues([def()], [{ definitionId: "d1", number: 1900 }]))).rejects.toMatchObject({ field: "annee" });
    await expect(run(validateAttributeValues([def()], []))).rejects.toMatchObject({ field: "annee" });
    const select = def({ kind: "select", key: "carburant", required: true, options: [{ id: "o1", key: "essence", labels, position: 0 }], minValue: null, maxValue: null });
    await expect(run(validateAttributeValues([select], [{ definitionId: "d1", optionId: "o1" }]))).resolves.toEqual([
      expect.objectContaining({ optionId: "o1" }),
    ]);
    await expect(run(validateAttributeValues([select], [{ definitionId: "d1", optionId: "nope" }]))).rejects.toMatchObject({ field: "carburant" });
  });
});
