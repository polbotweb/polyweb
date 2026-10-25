/**
 * Définitions de champs dynamiques (brique b) — partagées par les types de
 * contenu définis depuis l'admin et par le constructeur de formulaires (brique g).
 *
 * Les définitions sont stockées en JSONB ; ce module fournit :
 *   - le schéma zod qui valide une définition de type/formulaire
 *   - `buildDataSchema()` qui construit le validateur zod des données saisies
 */
import { z } from "astro/zod";

export const FIELD_TYPES = [
  "text", "textarea", "markdown", "number", "boolean", "date", "datetime",
  "select", "multiselect", "email", "url", "media", "relation", "json",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Types autorisés dans un formulaire public (pas de média/relation/json). */
export const FORM_FIELD_TYPES = ["text", "textarea", "number", "boolean", "date", "select", "multiselect", "email", "url"] as const satisfies readonly FieldType[];

export const RESERVED_FIELD_NAMES = new Set([
  "id", "slug", "status", "title", "locale", "createdAt", "updatedAt", "publishedAt", "blocks", "seo", "type", "site", "_hp",
]);

const localizedLabel = z.union([z.string().min(1).max(120), z.record(z.string(), z.string().max(120))]);

export const fieldDefinitionSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/, "nom de champ : camelCase/snake_case, commence par une minuscule"),
    label: localizedLabel,
    type: z.enum(FIELD_TYPES),
    required: z.boolean().optional().default(false),
    /** Valeur propre à chaque langue (sinon partagée entre traductions). */
    localized: z.boolean().optional().default(true),
    helpText: z.string().max(300).optional(),
    options: z.array(z.object({ value: z.string().min(1).max(100), label: localizedLabel })).max(200).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().max(200).optional(),
    /** Pour `relation` : slug du type de contenu cible. */
    relationType: z.string().max(64).optional(),
    multiple: z.boolean().optional(),
  })
  .superRefine((f, ctx) => {
    if (RESERVED_FIELD_NAMES.has(f.name)) ctx.addIssue({ code: "custom", message: `nom réservé : ${f.name}`, path: ["name"] });
    if ((f.type === "select" || f.type === "multiselect") && !f.options?.length) ctx.addIssue({ code: "custom", message: "options requises pour select/multiselect", path: ["options"] });
    if (f.type === "relation" && !f.relationType) ctx.addIssue({ code: "custom", message: "relationType requis", path: ["relationType"] });
    if (f.pattern) { try { new RegExp(f.pattern); } catch { ctx.addIssue({ code: "custom", message: "pattern invalide", path: ["pattern"] }); } }
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) ctx.addIssue({ code: "custom", message: "min > max", path: ["min"] });
  });

export type FieldDefinition = z.output<typeof fieldDefinitionSchema>;
export type FieldDefinitionInput = z.input<typeof fieldDefinitionSchema>;

export function fieldListSchema(allowed: readonly FieldType[] = FIELD_TYPES) {
  return z
    .array(fieldDefinitionSchema)
    .max(100)
    .superRefine((fields, ctx) => {
      const seen = new Set<string>();
      fields.forEach((f, i) => {
        if (seen.has(f.name)) ctx.addIssue({ code: "custom", message: `champ dupliqué : ${f.name}`, path: [i, "name"] });
        seen.add(f.name);
        if (!allowed.includes(f.type)) ctx.addIssue({ code: "custom", message: `type non autorisé ici : ${f.type}`, path: [i, "type"] });
      });
    });
}

export function parseFieldDefinitions(input: unknown, allowed?: readonly FieldType[]): FieldDefinition[] {
  return fieldListSchema(allowed).parse(input);
}

export function labelFor(label: FieldDefinition["label"], locale: string): string {
  if (typeof label === "string") return label;
  return label[locale] ?? label.fr ?? label.en ?? Object.values(label)[0] ?? "";
}

const SAFE_URL = /^(https?:\/\/|\/(?!\/))/i;

function fieldSchema(f: FieldDefinition): z.ZodType {
  let s: z.ZodType;
  switch (f.type) {
    case "text":
    case "textarea":
    case "markdown": {
      let str = z.string().trim().max(f.max ?? (f.type === "text" ? 500 : 100_000));
      if (f.min !== undefined) str = str.min(f.min);
      if (f.pattern) str = str.regex(new RegExp(f.pattern));
      s = f.required ? str.min(Math.max(1, f.min ?? 1)) : str;
      break;
    }
    case "email": s = z.string().trim().toLowerCase().pipe(z.email()); break;
    case "url": s = z.string().trim().max(2000).regex(SAFE_URL, "URL http(s) ou chemin relatif"); break;
    case "number": {
      let n = z.coerce.number().finite();
      if (f.min !== undefined) n = n.min(f.min);
      if (f.max !== undefined) n = n.max(f.max);
      s = n;
      break;
    }
    case "boolean":
      s = z.preprocess((v) => (v === "on" || v === "true" || v === "1" ? true : v === "false" || v === "0" || v === "" ? false : v), z.boolean());
      break;
    case "date": s = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date AAAA-MM-JJ"); break;
    case "datetime": s = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "date/heure invalide"); break;
    case "select": {
      const values = (f.options ?? []).map((o) => o.value) as [string, ...string[]];
      s = z.enum(values);
      break;
    }
    case "multiselect": {
      const values = (f.options ?? []).map((o) => o.value) as [string, ...string[]];
      const arr = z.array(z.enum(values)).max(values.length);
      s = z.preprocess((v) => (typeof v === "string" ? [v] : v), f.required ? arr.min(1, "au moins une valeur") : arr);
      break;
    }
    case "media": s = z.string().trim().max(2000).regex(SAFE_URL, "URL média invalide"); break;
    case "relation": {
      const id = z.string().uuid();
      s = f.multiple ? z.array(id).max(200) : id;
      break;
    }
    case "json": s = z.unknown(); break;
  }
  if (f.required) return s;
  // Champ facultatif : chaîne vide → undefined
  return z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());
}

/**
 * Construit le validateur des données d'une entrée / soumission.
 * `scope` : "localized" → seulement les champs traduits ; "shared" → seulement les non traduits ; "all".
 */
export function buildDataSchema(fields: readonly FieldDefinition[], scope: "all" | "localized" | "shared" = "all") {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    if (scope === "localized" && !f.localized) continue;
    if (scope === "shared" && f.localized) continue;
    shape[f.name] = fieldSchema(f);
  }
  return z.object(shape).strip();
}

/** Formate les erreurs zod en { champ: message } pour l'UI. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
