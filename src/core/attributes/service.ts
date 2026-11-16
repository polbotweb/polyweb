/**
 * Service Effect de persistance des attributs dynamiques (définitions, options, valeurs).
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { LOCALES, type Locale } from "@i18n/config";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { dbTransaction, type DbTransaction } from "@/lib/effect/transaction";
import { completeLocales } from "./kinds";
import {
  attributeDefinitionTranslations, attributeDefinitions, attributeOptionTranslations, attributeOptions, attributeValueOptions, attributeValues,
} from "./schema";
import { validateAttributeValues, validateDefinitionDraft, type AttributeDefinitionDraft, type AttributeValueInput, type LoadedDefinition, type LoadedOption, type ValidatedAttributeValue } from "./validation";

type Exec = ReturnType<typeof getDrizzle> | DbTransaction;

const dbOf = (executor?: Exec) => executor ?? getDrizzle();

const groupTranslations = (rows: { definitionId: string; locale: string; label: string; description: string | null }[]) => {
  const map = new Map<string, { labels: ReturnType<typeof completeLocales>; description: Partial<Record<Locale, string>> }>();
  for (const row of rows) {
    const entry = map.get(row.definitionId) ?? { labels: completeLocales({}), description: {} };
    entry.labels[row.locale as Locale] = row.label;
    if (row.description) entry.description[row.locale as Locale] = row.description;
    map.set(row.definitionId, entry);
  }
  return map;
};

const groupOptions = (options: { id: string; definitionId: string; key: string; position: number }[], translations: { optionId: string; locale: string; label: string }[]) => {
  const labels = new Map<string, ReturnType<typeof completeLocales>>();
  for (const row of translations) {
    const entry = labels.get(row.optionId) ?? completeLocales({});
    entry[row.locale as Locale] = row.label;
    labels.set(row.optionId, entry);
  }
  const byDef = new Map<string, LoadedOption[]>();
  for (const option of options) {
    const list = byDef.get(option.definitionId) ?? [];
    list.push({ id: option.id, key: option.key, position: option.position, labels: labels.get(option.id) ?? completeLocales({ fr: option.key }) });
    byDef.set(option.definitionId, list);
  }
  return byDef;
};

export const assembleDefinitions = (executor: Exec, definitionIds: readonly string[]) =>
  Effect.gen(function* () {
    if (definitionIds.length === 0) return [] as LoadedDefinition[];
    const db = dbOf(executor);
    const defs = yield* dbTry("attributes.definitions.load", () => db.select().from(attributeDefinitions).where(inArray(attributeDefinitions.id, [...definitionIds])));
    const tr = yield* dbTry("attributes.definitions.tr", () => db.select().from(attributeDefinitionTranslations).where(inArray(attributeDefinitionTranslations.definitionId, [...definitionIds])));
    const opts = yield* dbTry("attributes.options.load", () => db.select().from(attributeOptions).where(inArray(attributeOptions.definitionId, [...definitionIds])).orderBy(asc(attributeOptions.position)));
    const optTr = opts.length === 0 ? [] : yield* dbTry("attributes.options.tr", () => db.select().from(attributeOptionTranslations).where(inArray(attributeOptionTranslations.optionId, opts.map((o) => o.id))));
    const trMap = groupTranslations(tr);
    const optMap = groupOptions(opts, optTr);
    const byId = new Map(defs.map((d) => [d.id, d]));
    return definitionIds.flatMap((id): LoadedDefinition[] => {
      const d = byId.get(id);
      if (!d) return [];
      const loc = trMap.get(d.id);
      return [{
        id: d.id, module: d.module, ownerType: d.ownerType, ownerId: d.ownerId, key: d.key, kind: d.kind,
        required: d.required, filterable: d.filterable, unit: d.unit, minValue: d.minValue, maxValue: d.maxValue, position: d.position,
        labels: loc?.labels ?? completeLocales({ fr: d.key }), description: loc?.description ?? {},
        options: (optMap.get(d.id) ?? []).sort((a, b) => a.position - b.position),
      }];
    });
  });

export const listDefinitions = (module: string, ownerType: string, ownerIds: readonly string[], executor?: Exec) =>
  Effect.gen(function* () {
    if (ownerIds.length === 0) return [] as LoadedDefinition[];
    const rows = yield* dbTry("attributes.definitions.list", () =>
      dbOf(executor).select({ id: attributeDefinitions.id, ownerId: attributeDefinitions.ownerId, position: attributeDefinitions.position, key: attributeDefinitions.key })
        .from(attributeDefinitions)
        .where(and(eq(attributeDefinitions.module, module), eq(attributeDefinitions.ownerType, ownerType), inArray(attributeDefinitions.ownerId, [...ownerIds])))
        .orderBy(asc(attributeDefinitions.position), asc(attributeDefinitions.key)),
    );
    // Héritage : le propriétaire le plus proche (dernier de `ownerIds`) écrase une même clé.
    const loaded = yield* assembleDefinitions(executor ?? getDrizzle(), rows.map((r) => r.id));
    const rank = new Map(ownerIds.map((id, i) => [id, i]));
    const byKey = new Map<string, LoadedDefinition>();
    for (const def of [...loaded].sort((a, b) => (rank.get(a.ownerId) ?? 0) - (rank.get(b.ownerId) ?? 0))) {
      byKey.set(def.key, def);
    }
    return [...byKey.values()].sort((a, b) => a.position - b.position || a.key.localeCompare(b.key));
  });

const writeOptions = (tx: DbTransaction, definitionId: string, options: NonNullable<AttributeDefinitionDraft["options"]>) =>
  Effect.gen(function* () {
    yield* dbTry("attributes.options.clear", () => tx.delete(attributeOptions).where(eq(attributeOptions.definitionId, definitionId)));
    for (const [i, option] of options.entries()) {
      const [row] = yield* dbTry("attributes.options.insert", () =>
        tx.insert(attributeOptions).values({ definitionId, key: option.key, position: option.position ?? i }).returning({ id: attributeOptions.id }),
      );
      yield* dbTry("attributes.options.tr.insert", () =>
        tx.insert(attributeOptionTranslations).values(LOCALES.map((locale) => ({ optionId: row.id, locale, label: option.labels[locale] }))),
      );
    }
  });

const replaceTranslations = (tx: DbTransaction, definitionId: string, draft: AttributeDefinitionDraft) =>
  Effect.gen(function* () {
    yield* dbTry("attributes.definitions.tr.clear", () => tx.delete(attributeDefinitionTranslations).where(eq(attributeDefinitionTranslations.definitionId, definitionId)));
    yield* dbTry("attributes.definitions.tr.insert", () =>
      tx.insert(attributeDefinitionTranslations).values(LOCALES.map((locale) => ({
        definitionId, locale, label: draft.labels[locale], description: draft.description?.[locale] ?? null,
      }))),
    );
  });

export const createDefinition = (draft: AttributeDefinitionDraft) =>
  Effect.gen(function* () {
    const valid = yield* validateDefinitionDraft(draft);
    return yield* dbTransaction("attributes.definition.create", (tx) =>
      Effect.gen(function* () {
        const [row] = yield* dbTry("attributes.definition.insert", () =>
          tx.insert(attributeDefinitions).values({
            module: valid.module, ownerType: valid.ownerType, ownerId: valid.ownerId, key: valid.key, kind: valid.kind,
            required: valid.required, filterable: valid.filterable, unit: valid.unit ?? null, minValue: valid.minValue ?? null, maxValue: valid.maxValue ?? null,
            position: valid.position ?? 0,
          }).returning({ id: attributeDefinitions.id }),
        );
        yield* replaceTranslations(tx, row.id, valid);
        if (valid.options?.length) yield* writeOptions(tx, row.id, valid.options);
        const [loaded] = yield* assembleDefinitions(tx, [row.id]);
        return loaded;
      }),
    );
  });

export const updateDefinition = (id: string, draft: AttributeDefinitionDraft) =>
  Effect.gen(function* () {
    const valid = yield* validateDefinitionDraft(draft);
    return yield* dbTransaction("attributes.definition.update", (tx) =>
      Effect.gen(function* () {
        const updated = yield* dbTry("attributes.definition.update", () =>
          tx.update(attributeDefinitions).set({
            key: valid.key, kind: valid.kind, required: valid.required, filterable: valid.filterable, unit: valid.unit ?? null,
            minValue: valid.minValue ?? null, maxValue: valid.maxValue ?? null, position: valid.position ?? 0, updatedAt: new Date(),
          }).where(and(eq(attributeDefinitions.id, id), eq(attributeDefinitions.module, valid.module), eq(attributeDefinitions.ownerType, valid.ownerType), eq(attributeDefinitions.ownerId, valid.ownerId))).returning({ id: attributeDefinitions.id }),
        );
        if (!updated[0]) return null;
        yield* replaceTranslations(tx, id, valid);
        yield* writeOptions(tx, id, valid.options ?? []);
        const [loaded] = yield* assembleDefinitions(tx, [id]);
        return loaded ?? null;
      }),
    );
  });

export const deleteDefinition = (id: string, module: string) =>
  dbTry("attributes.definition.delete", () => getDrizzle().delete(attributeDefinitions).where(and(eq(attributeDefinitions.id, id), eq(attributeDefinitions.module, module))).returning({ id: attributeDefinitions.id })).pipe(Effect.map((rows) => rows.length > 0));

export const replaceValues = (tx: DbTransaction, resourceType: string, resourceId: string, values: readonly ValidatedAttributeValue[]) =>
  Effect.gen(function* () {
    yield* dbTry("attributes.values.clear", () => tx.delete(attributeValues).where(and(eq(attributeValues.resourceType, resourceType), eq(attributeValues.resourceId, resourceId))));
    yield* dbTry("attributes.valueOptions.clear", () => tx.delete(attributeValueOptions).where(and(eq(attributeValueOptions.resourceType, resourceType), eq(attributeValueOptions.resourceId, resourceId))));
    if (values.length === 0) return;
    yield* dbTry("attributes.values.insert", () =>
      tx.insert(attributeValues).values(values.map((v) => ({
        definitionId: v.definitionId, resourceType, resourceId, textValue: v.textValue, numberValue: v.numberValue, booleanValue: v.booleanValue, dateValue: v.dateValue, optionId: v.optionId,
      }))),
    );
    const multi = values.flatMap((v) => v.optionIds.map((optionId) => ({ definitionId: v.definitionId, resourceType, resourceId, optionId })));
    if (multi.length) yield* dbTry("attributes.valueOptions.insert", () => tx.insert(attributeValueOptions).values(multi));
  });

export const saveValues = (resourceType: string, resourceId: string, definitions: readonly LoadedDefinition[], inputs: readonly AttributeValueInput[]) =>
  Effect.gen(function* () {
    const values = yield* validateAttributeValues(definitions, inputs);
    yield* dbTransaction("attributes.values.save", (tx) => replaceValues(tx, resourceType, resourceId, values));
    return values;
  });

export const loadValues = (resourceType: string, resourceId: string, executor?: Exec) =>
  Effect.gen(function* () {
    const db = dbOf(executor);
    const rows = yield* dbTry("attributes.values.load", () => db.select().from(attributeValues).where(and(eq(attributeValues.resourceType, resourceType), eq(attributeValues.resourceId, resourceId))));
    const multi = yield* dbTry("attributes.valueOptions.load", () => db.select().from(attributeValueOptions).where(and(eq(attributeValueOptions.resourceType, resourceType), eq(attributeValueOptions.resourceId, resourceId))));
    const optionIds = new Map<string, string[]>();
    for (const row of multi) {
      const list = optionIds.get(row.definitionId) ?? [];
      list.push(row.optionId);
      optionIds.set(row.definitionId, list);
    }
    return rows.map((row): ValidatedAttributeValue => ({
      definitionId: row.definitionId, textValue: row.textValue, numberValue: row.numberValue, booleanValue: row.booleanValue, dateValue: row.dateValue, optionId: row.optionId, optionIds: optionIds.get(row.definitionId) ?? [],
    }));
  });

export const definitionLabel = (definition: LoadedDefinition, locale: string) => definition.labels[(LOCALES as readonly string[]).includes(locale) ? locale as Locale : "fr"] || definition.labels.fr || definition.key;

export const optionLabel = (option: LoadedOption, locale: string) => option.labels[(LOCALES as readonly string[]).includes(locale) ? locale as Locale : "fr"] || option.labels.fr || option.key;
