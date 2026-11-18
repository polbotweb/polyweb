/**
 * Validation Effect des définitions et des valeurs d'attributs (purs vis-à-vis de la base).
 */
import { Effect, Data } from "effect";
import type { Locale } from "@i18n/config";
import { ATTRIBUTE_KEY_RE, OPTION_KEY_RE, isAttributeKind, type AttributeKind, type LocaleMap } from "./kinds";

export class AttributeValidationError extends Data.TaggedError("AttributeValidationError")<{
  readonly field: string;
  readonly message: string;
}> {}

export interface AttributeOptionInput {
  readonly key: string;
  readonly labels: LocaleMap;
  readonly position?: number;
}

export interface AttributeDefinitionDraft {
  readonly module: string;
  readonly ownerType: string;
  readonly ownerId: string;
  readonly key: string;
  readonly kind: AttributeKind;
  readonly required: boolean;
  readonly filterable: boolean;
  readonly unit?: string | null;
  readonly minValue?: number | null;
  readonly maxValue?: number | null;
  readonly position?: number;
  readonly labels: LocaleMap;
  readonly description?: Partial<Record<Locale, string>>;
  readonly options?: readonly AttributeOptionInput[];
}

export interface LoadedOption {
  readonly id: string;
  readonly key: string;
  readonly labels: LocaleMap;
  readonly position: number;
}

export interface LoadedDefinition {
  readonly id: string;
  readonly module: string;
  readonly ownerType: string;
  readonly ownerId: string;
  readonly key: string;
  readonly kind: AttributeKind;
  readonly required: boolean;
  readonly filterable: boolean;
  readonly unit: string | null;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly position: number;
  readonly labels: LocaleMap;
  readonly description: Partial<Record<Locale, string>>;
  readonly options: readonly LoadedOption[];
}

/** Valeur saisie (formulaire ou API) : un seul canal typé selon le kind. */
export interface AttributeValueInput {
  readonly definitionId: string;
  readonly text?: string | null;
  readonly number?: number | null;
  readonly boolean?: boolean | null;
  readonly date?: string | null;
  readonly optionId?: string | null;
  readonly optionIds?: readonly string[] | null;
}

export interface ValidatedAttributeValue {
  readonly definitionId: string;
  readonly textValue: string | null;
  readonly numberValue: number | null;
  readonly booleanValue: boolean | null;
  readonly dateValue: string | null;
  readonly optionId: string | null;
  readonly optionIds: readonly string[];
}

const fail = (field: string, message: string) => new AttributeValidationError({ field, message });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const validateDefinitionDraft = (input: AttributeDefinitionDraft) =>
  Effect.gen(function* () {
    if (!input.module.trim() || !input.ownerType.trim() || !input.ownerId.trim()) {
      return yield* fail("owner", "Le propriétaire de l'attribut est incomplet.");
    }
    if (!ATTRIBUTE_KEY_RE.test(input.key)) return yield* fail("key", "Clé d'attribut invalide.");
    if (!isAttributeKind(input.kind)) return yield* fail("kind", "Type d'attribut inconnu.");
    if (!input.labels.fr.trim()) return yield* fail("labels", "Le libellé français est obligatoire.");
    for (const locale of ["fr", "en", "es", "ar"] as const) {
      if (!input.labels[locale].trim()) return yield* fail("labels", `Libellé manquant pour la langue ${locale}.`);
    }
    if (input.unit && input.unit.length > 24) return yield* fail("unit", "Unité trop longue.");
    if (input.minValue != null && input.maxValue != null && input.minValue > input.maxValue) {
      return yield* fail("minValue", "Le minimum ne peut pas dépasser le maximum.");
    }
    const needsOptions = input.kind === "select" || input.kind === "multiselect";
    const options = input.options ?? [];
    if (needsOptions && options.length === 0) return yield* fail("options", "Au moins une option est requise.");
    if (!needsOptions && options.length > 0) return yield* fail("options", "Ce type d'attribut n'accepte pas d'options.");
    const keys = new Set<string>();
    for (const option of options) {
      if (!OPTION_KEY_RE.test(option.key)) return yield* fail("options", `Clé d'option invalide : ${option.key}.`);
      if (keys.has(option.key)) return yield* fail("options", `Option en double : ${option.key}.`);
      keys.add(option.key);
      if (!option.labels.fr.trim()) return yield* fail("options", `Libellé français manquant pour ${option.key}.`);
      for (const locale of ["fr", "en", "es", "ar"] as const) {
        if (!option.labels[locale].trim()) return yield* fail("options", `Libellé ${locale} manquant pour ${option.key}.`);
      }
    }
    return input;
  });

const inRange = (value: number, min: number | null, max: number | null) =>
  (min == null || value >= min) && (max == null || value <= max);

export const validateAttributeValues = (definitions: readonly LoadedDefinition[], inputs: readonly AttributeValueInput[]) =>
  Effect.gen(function* () {
    const byId = new Map(definitions.map((d) => [d.id, d]));
    const seen = new Set<string>();
    const out: ValidatedAttributeValue[] = [];
    for (const input of inputs) {
      const def = byId.get(input.definitionId);
      if (!def) return yield* fail("definitionId", "Attribut inconnu pour cette ressource.");
      if (seen.has(def.id)) return yield* fail(def.key, "Valeur d'attribut en double.");
      seen.add(def.id);
      const empty: ValidatedAttributeValue = { definitionId: def.id, textValue: null, numberValue: null, booleanValue: null, dateValue: null, optionId: null, optionIds: [] };
      if (def.kind === "text") {
        const text = (input.text ?? "").trim();
        if (!text) {
          if (def.required) return yield* fail(def.key, "Ce champ est obligatoire.");
          continue;
        }
        if (text.length > 500) return yield* fail(def.key, "Texte trop long (500 caractères).");
        out.push({ ...empty, textValue: text });
        continue;
      }
      if (def.kind === "number" || def.kind === "integer") {
        const raw = input.number;
        if (raw == null || Number.isNaN(raw)) {
          if (def.required) return yield* fail(def.key, "Ce champ est obligatoire.");
          continue;
        }
        if (!Number.isFinite(raw)) return yield* fail(def.key, "Nombre invalide.");
        if (def.kind === "integer" && !Number.isSafeInteger(raw)) return yield* fail(def.key, "Un entier est requis.");
        if (!inRange(raw, def.minValue, def.maxValue)) return yield* fail(def.key, "Valeur hors bornes.");
        out.push({ ...empty, numberValue: raw });
        continue;
      }
      if (def.kind === "boolean") {
        if (input.boolean == null) {
          if (def.required) return yield* fail(def.key, "Ce champ est obligatoire.");
          continue;
        }
        out.push({ ...empty, booleanValue: input.boolean });
        continue;
      }
      if (def.kind === "date") {
        const date = (input.date ?? "").trim();
        if (!date) {
          if (def.required) return yield* fail(def.key, "Ce champ est obligatoire.");
          continue;
        }
        if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return yield* fail(def.key, "Date invalide.");
        const serial = Date.parse(`${date}T00:00:00Z`) / 86_400_000;
        if (!inRange(serial, def.minValue, def.maxValue)) return yield* fail(def.key, "Date hors bornes.");
        out.push({ ...empty, dateValue: date });
        continue;
      }
      const optionIds = def.kind === "multiselect" ? [...new Set(input.optionIds ?? [])] : input.optionId ? [input.optionId] : [];
      if (optionIds.length === 0) {
        if (def.required) return yield* fail(def.key, "Ce champ est obligatoire.");
        continue;
      }
      const allowed = new Set(def.options.map((o) => o.id));
      if (optionIds.some((id) => !allowed.has(id))) return yield* fail(def.key, "Option invalide.");
      if (def.kind === "select") out.push({ ...empty, optionId: optionIds[0] ?? null });
      else out.push({ ...empty, optionIds });
    }
    for (const def of definitions) {
      if (def.required && !seen.has(def.id) && !out.some((v) => v.definitionId === def.id)) {
        return yield* fail(def.key, "Ce champ est obligatoire.");
      }
    }
    return out;
  });
