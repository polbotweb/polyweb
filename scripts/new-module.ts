/**
 * Génère un module conforme à `docs/cms/module-system.md` (repris d'atlaselle).
 *
 *   pnpm module:new <domaine> [--entity=entityName]
 *
 * Ne crée QUE ce qui est obligatoire : un dossier vide est une dette. Le socle
 * généré utilise les abstractions core : schéma (contenu, révisions, verrous),
 * workflow (core/workflow), verrou (core/locks), garde de permission Effect,
 * service Effect (dbTry), loader Effect + adaptateur Promise, actions à prologue Effect. Les
 * dossiers optionnels (`engagement/`, `repositories/`, `seo/`, …) s'ajoutent
 * quand on en a besoin, pas d'avance.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const entityFlag = args.find((a) => a.startsWith("--entity="));
const rootFlag = args.find((a) => a.startsWith("--root="));

if (!name) {
  console.error("usage: pnpm module:new <domaine> [--entity=entite] [--table=nom_sql]");
  process.exit(1);
}
if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error(`nom invalide: "${name}" — kebab-case attendu (ex: blog, email-voyage)`);
  process.exit(1);
}

const pascal = name
  .split("-")
  .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
  .join("");
const entity = entityFlag?.split("=")[1] ?? name.replace(/s$/, "");

/**
 * Nom kebab → camelCase, pour un identifiant TypeScript valide.
 * `email-voyage` devient `emailVoyage` : écrire `${name}Module` produirait
 * `email-voyageModule`, qui ne compile pas.
 */
const camel = name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * Même contrainte pour l'entité : `email-voyage` donnerait un identifiant
 * `email-voyageAdminResource`, qui ne compile pas.
 */
const entityCamel = entity.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Nom SQL (snake_case) et préfixe de constantes (SCREAMING_SNAKE) du domaine. */
const snake = name.replace(/-/g, "_");
const upper = snake.toUpperCase();

/**
 * Pluriel anglais simple d'un nom snake_case (dernier segment) : category → categories,
 * box → boxes, class → classes, product → products ; déjà au pluriel (…s) → inchangé.
 */
function pluralizeSnake(word: string): string {
  if (/(ss|sh|ch|x|z)$/.test(word)) return word + "es";
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + "ies";
  if (word.endsWith("s")) return word;
  return word + "s";
}

/**
 * Tables SQL nommées d'après l'entité au pluriel (`--entity=product` → `products`,
 * `products_revisions`, `products_locks`), pas d'après le domaine. `--table=<snake>`
 * force un autre nom. Les modules existants gardent leurs tables (aucun renommage).
 */
const tableFlag = args.find((a) => a.startsWith("--table="))?.split("=")[1];
const table = tableFlag ?? pluralizeSnake(entity.replace(/-/g, "_"));
if (!/^[a-z][a-z0-9_]*$/.test(table)) {
  console.error(`nom de table invalide: "${table}" — snake_case attendu (ex: products)`);
  process.exit(1);
}

// `--root=<dir>` permet de générer ailleurs que dans `src/` (tests, essais).
const root = rootFlag?.split("=")[1] ?? "src";
const moduleDir = join(root, "modules", name);
const compDir = join(root, "components", name);

if (existsSync(moduleDir) || existsSync(compDir)) {
  console.error(`"${name}" existe déjà — rien n'a été écrit.`);
  process.exit(1);
}

/** Fichiers .ts sous `dir` (récursif) : détection des tables SQL déjà déclarées. */
function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? tsFiles(p) : e.name.endsWith(".ts") ? [p] : [];
  });
}
const taken = [table, `${table}_revisions`, `${table}_locks`].filter((t) =>
  tsFiles(join(root, "database")).concat(tsFiles(join(root, "modules"))).some((f) => readFileSync(f, "utf8").includes(`pgTable("${t}"`)),
);
if (taken.length) {
  console.error(`table(s) déjà déclarée(s) : ${taken.join(", ")} — choisir --entity=… ou --table=… ; rien n'a été écrit.`);
  process.exit(1);
}

const files = {
  // ── Module ────────────────────────────────────────────────────────────
  [`${moduleDir}/module.ts`]: `import type {
  PolywebModuleCapabilityProviders,
  PolywebModuleDefinition,
} from "@/core/modules/module-contract";
import {
  assertModuleCapabilityProviders,
  defineModuleCapabilities,
  defineModuleCapabilityProviders,
  defineModulePresentations,
} from "@/core/modules/module-contract";
import { ${camel}CapabilityProviders } from "./capabilities";

/**
 * Le contrat \`PolywebModuleCapabilities\` attend TOUTES les clés : une
 * capacité non listée est désactivée, donc il faut les écrire explicitement
 * plutôt que de ne mentionner que les actives.
 *
 * \`assertModuleCapabilityProviders\` refuse à l'exécution un module qui
 * active une capacité sans fournisseur, ou qui déclare une recherche sans
 * définition.
 */
export const ${camel}Module: PolywebModuleDefinition = {
  id: "${name}",
  entity: "${entity}",
  capabilities: defineModuleCapabilities({
    content: true,
    localization: true,
    media: false,
    seo: false,
    taxonomy: false,
    attributes: false,
    search: false,
    publication: true,
    revisions: true,
    locks: true,
    engagement: false,
    moderation: false,
    notifications: false,
    audit: false,
    cache: false,
  }),
  capabilityProviders: defineModuleCapabilityProviders(
    ${camel}CapabilityProviders satisfies PolywebModuleCapabilityProviders,
  ),
  presentations: defineModulePresentations({
    card: ["default"],
    list: ["default"],
    single: ["default"],
    ui: [],
  }),
};

assertModuleCapabilityProviders(${camel}Module);
`,

  [`${moduleDir}/capabilities.ts`]: `import type { PolywebModuleCapabilityProviders } from "@/core/modules/module-contract";

/**
 * Une entrée par capacité ACTIVÉE dans \`module.ts\`.
 *
 * La valeur nomme la table ou l'action qui porte concrètement la capacité.
 * \`assertModuleCapabilityProviders\` refuse un module qui active une capacité
 * sans fournisseur : c'est le garde-fou qui empêche une déclaration fantaisiste.
 */
export const ${camel}CapabilityProviders = {
  content: "${name}",
  localization: "${name}Translations",
  publication: "${camel}Workflow",
  revisions: "${table}_revisions",
  locks: "${table}_locks",
} as unknown as PolywebModuleCapabilityProviders;
`,

  [`${moduleDir}/loaders/${entity}.loader.ts`]: `/**
 * Lecture du domaine ${name}.
 *
 * SEUL endroit autorisé à LIRE la base pour ce domaine (les écritures passent par
 * \`services/\`). Chaque lecture est un Effect (\`dbTry\` → DbError typé) ;
 * \`load${pascal}\` en est l'adaptateur Promise pour les pages Astro. Les composants
 * reçoivent des DTO, jamais des lignes brutes.
 */
import { Effect } from "effect";
import { and, eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry, runOrThrow } from "@/lib/effect/run";
import { ${camel} } from "../schema";

/** DTO public du domaine. */
export interface ${pascal}DTO {
  id: string;
  slug: string;
  title: string;
  status: string;
}

export const ${camel}Loader = {
  /**
   * @param viewerId lecteur connecté, ou null pour un visiteur anonyme : un
   *   visiteur ne voit que le publié. Les données dépendant de la session ne
   *   doivent pas passer par un cache public.
   */
  byId: (id: string, viewerId: string | null) =>
    dbTry("${name}.byId", () =>
      getDrizzle()
        .select({ id: ${camel}.id, slug: ${camel}.slug, title: ${camel}.title, status: ${camel}.status })
        .from(${camel})
        .where(viewerId ? eq(${camel}.id, id) : and(eq(${camel}.id, id), eq(${camel}.status, "PUBLISHED")))
        .limit(1),
    ).pipe(Effect.map((rows): ${pascal}DTO | null => rows[0] ?? null)),
};

/** Adaptateur Promise (pages Astro). */
export const load${pascal} = (id: string, viewerId: string | null): Promise<${pascal}DTO | null> =>
  runOrThrow(${camel}Loader.byId(id, viewerId));
`,

  [`${moduleDir}/loaders/${entity}-admin.loader.ts`]: `/**
 * Liste back-office du domaine ${name} (core/filters) : filtres lus dans l'URL
 * canonique de la ressource admin, conditions SQL partagées par la liste et les
 * comptes, facettes calculées par \`computeFacets\` (Effect, FacetError typé) —
 * chaque facette est comptée avec les autres filtres actifs mais sans le sien,
 * toujours dans le tenant.
 */
import { and, count, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { computeFacets, parseListUrlState } from "@/core/filters";
import { runOrThrow } from "@/lib/effect/run";
import { ${entityCamel}AdminResource } from "../admin/resource";
import { ${upper}_STATUSES, type ${pascal}Status } from "../domain/workflow";
import { ${camel} } from "../schema";

export interface ${pascal}AdminFilters {
  readonly search?: string;
  readonly status?: ${pascal}Status;
}

/** URL → filtres typés (valeurs hors définition ignorées par parseListUrlState). */
export function ${camel}AdminFiltersFromUrl(params: URLSearchParams | string): ${pascal}AdminFilters {
  const { filters } = parseListUrlState(${entityCamel}AdminResource.list!, params);
  return {
    search: typeof filters.search === "string" ? filters.search : undefined,
    status: ${upper}_STATUSES.find((status) => status === filters.status),
  };
}

const escapeLike = (value: string) => value.replace(/[\\\\%_]/g, (c) => "\\\\" + c);

/** Conditions SQL (tenant + filtres) partagées par la liste, le total et les facettes. */
export function ${camel}AdminConditions(organizationId: string | null, filters: ${pascal}AdminFilters): SQL[] {
  const conditions: SQL[] = [organizationId === null ? isNull(${camel}.organizationId) : eq(${camel}.organizationId, organizationId)];
  if (filters.search) conditions.push(ilike(${camel}.title, "%" + escapeLike(filters.search) + "%"));
  if (filters.status) conditions.push(eq(${camel}.status, filters.status));
  return conditions;
}

/** Comptes de facettes de la liste admin (Effect). */
export const ${camel}AdminFacets = (organizationId: string | null, filters: ${pascal}AdminFilters) =>
  computeFacets(filters, [
    {
      id: "status",
      filterKey: "status",
      count: async (without) => {
        const rows = await getDrizzle()
          .select({ value: ${camel}.status, count: count() })
          .from(${camel})
          .where(and(...${camel}AdminConditions(organizationId, without)))
          .groupBy(${camel}.status);
        return rows.map((row) => ({ value: String(row.value), count: Number(row.count) }));
      },
    },
  ]);

/** Adaptateur Promise (pages Astro). */
export const load${pascal}AdminFacets = (organizationId: string | null, filters: ${pascal}AdminFilters) =>
  runOrThrow(${camel}AdminFacets(organizationId, filters));
`,

  [`${moduleDir}/loaders/index.ts`]: `export * from "./${entity}.loader";
export * from "./${entity}-admin.loader";
`,

  [`${moduleDir}/client/init.ts`]: `/**
 * Point d'entrée navigateur du domaine ${name}.
 *
 * Un module client par feature, importé ici. Les composants n'importent QUE ce
 * fichier — jamais \`astro:actions\` directement — pour que sélecteurs et
 * actions restent regroupés et testables hors rendu.
 */

/**
 * Branche les comportements d'une page. Idempotent : appelé au premier rendu
 * puis à chaque \`astro:after-swap\`.
 */
export function init${pascal}(): void {
  // TODO: appeler les modules client du domaine, par exemple
  //   init${pascal}EngagementBar();
}
`,

  [`${moduleDir}/admin/resource.ts`]: `import { assertAdminResourceListDefinition } from "@/core/admin/filter-contract";
import { assertResourceCompatibility, type AdminResourceDefinition } from "@/lib/cms/resource-contract";
import { ${camel}Module } from "@/modules/${name}/module";
import { ${upper}_STATUSES } from "@/modules/${name}/domain/workflow";

/**
 * Définition de la liste back-office.
 *
 * Chaque filtre et chaque tri porte un \`queryParam\` : c'est lui que la liste
 * lit dans l'URL, ce qui rend une vue filtrée partageable par lien.
 * \`assertAdminResourceListDefinition\` valide qu'aucun identifiant n'est
 * dupliqué et que \`defaultSort\` désigne un tri déclaré.
 *
 * Facettes et vues enregistrées (core/filters) : le filtre \`status\` est compté par
 * \`${camel}AdminFacets\` (loaders/${entity}-admin.loader.ts) ; les vues enregistrées
 * exigent l'inscription de la ressource dans \`src/lib/admin/list-registry.ts\`.
 */
const ${entityCamel}ListDefinition = {
  filters: [
    { id: "search", kind: "search", queryParam: "search" },
    { id: "status", kind: "select", queryParam: "status", options: [...${upper}_STATUSES], facet: true },
  ],
  sorts: [{ id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] }],
  defaultSort: "createdAt",
  // Actions groupées (core/bulk, \`actions/bulk.ts\`) : ids = opérations du moteur ;
  // la barre générique \`AdminBulkBar\` les affiche (confirmation si archive).
  selection: true,
  bulkActions: [
    { id: "publish", permission: "${name}:publish" },
    { id: "unpublish", permission: "${name}:publish" },
    { id: "archive", permission: "${name}:update", confirmationKey: "${name}.bulk.archive" },
    { id: "restore", permission: "${name}:update" },
  ],
  facets: true,
  savedViews: true,
} as const;

assertAdminResourceListDefinition(${entityCamel}ListDefinition);

/**
 * Ressource back-office.
 *
 * La forme suit \`modules/blog/admin/resource.ts\` à la lettre : c'est la
 * référence la plus complète du dépôt. \`actions\` déclare ce que le
 * back-office sait faire — une action absente retire le bouton correspondant —
 * et \`permissionNamespace\` détermine les droits vérifiés par les loaders.
 */
export const ${entityCamel}AdminResource: AdminResourceDefinition = {
  id: "${entity}",
  entity: "${entity}",
  management: {
    list: true,
    search: true,
    filters: true,
    sort: true,
    pagination: true,
    stats: false,
    selection: true,
  },
  list: ${entityCamel}ListDefinition,
  actions: {
    create: true,
    read: true,
    update: true,
    duplicate: false,
    publish: false,
    unpublish: false,
    archive: false,
    restore: false,
    delete: false,
    bulk: true,
  },
  presentation: {
    card: ["default"],
    list: ["default"],
    single: ["default"],
  },
  permissionNamespace: "${name}",
};

// Échoue au chargement si la ressource et le module se contredisent.
assertResourceCompatibility(${camel}Module, ${entityCamel}AdminResource);
`,

  // ── Socle Effect du module (abstractions core) ────────────────────────
  // Schéma, workflow, verrou, garde de permission, service et actions : un module
  // généré utilise d'emblée core/locks, core/workflow, dbTry et les prologues Effect.
  [`${moduleDir}/schema/index.ts`]: `/**
 * Tables du domaine ${name} : contenu, révisions et verrous d'édition.
 *
 * À exporter depuis \`src/database/schemas.ts\` puis \`pnpm db:generate\`
 * pour produire la migration (le générateur n'écrit aucune migration).
 */
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "@database/schemas/auth.schema";
import { ${upper}_STATUSES } from "../domain/workflow";

export const ${camel} = pgTable("${table}", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status", { enum: ${upper}_STATUSES }).default("DRAFT").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [uniqueIndex("${table}_org_slug_uidx").on(table.organizationId, table.slug)]);

/** Révisions (core/revision) : une ligne par écriture, pour l'historique et la restauration. */
export const ${camel}Revisions = pgTable("${table}_revisions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().references(() => ${camel}.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  status: text("status", { enum: ${upper}_STATUSES }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("${table}_revisions_resource_idx").on(table.resourceId)]);

/** Verrous d'édition (core/locks) : une ligne par ressource, propriétaire utilisateur + session. */
export const ${camel}Locks = pgTable("${table}_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  resourceId: text("resource_id").notNull().unique().references(() => ${camel}.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
`,

  [`${moduleDir}/domain/workflow.ts`]: `/**
 * Workflow éditorial du domaine ${name} (core/workflow) : états et transitions
 * autorisées. Le service refuse toute transition absente de cette table.
 */
import type { WorkflowDefinition } from "@/core/workflow";

export const ${upper}_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ${pascal}Status = (typeof ${upper}_STATUSES)[number];

export const ${camel}Workflow: WorkflowDefinition<${pascal}Status> = {
  states: ${upper}_STATUSES,
  transitions: [
    { from: "DRAFT", to: "PUBLISHED" },
    { from: "PUBLISHED", to: "DRAFT" },
    { from: "DRAFT", to: "ARCHIVED" },
    { from: "PUBLISHED", to: "ARCHIVED" },
    { from: "ARCHIVED", to: "DRAFT" },
  ],
};
`,

  [`${moduleDir}/locks.ts`]: `/**
 * Verrou d'édition du domaine ${name}, déclaré auprès du verrou générique
 * \`src/core/locks\` : politique utilisateur + session, reprise par soi depuis
 * une autre session (\`takeOver\`), TTL, purge des verrous expirés, erreurs typées.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { defineLockResource, drizzleLockStore } from "@/core/locks/service";
import { ${camel}, ${camel}Locks } from "./schema";

export const ${camel}Lock = defineLockResource("${name}", drizzleLockStore("${name}", ${camel}Locks, "resourceId"), {
  // Organisation propriétaire : libération administrative réservée à l'administrateur global
  // ou aux owner/admin de CETTE organisation (action générique \`forceReleaseLock\`, auditée).
  tenantOf: (id) =>
    dbTry("${name}.lockTenant", () => getDrizzle().select({ organizationId: ${camel}.organizationId }).from(${camel}).where(eq(${camel}.id, id)).limit(1)).pipe(
      Effect.map((rows) => (rows[0] ? rows[0].organizationId : undefined)),
    ),
});
`,

  [`${moduleDir}/permissions/index.ts`]: `/**
 * Garde de permission Effect du domaine ${name} (RBAC better-auth). Le namespace
 * « ${name} » doit être déclaré dans le contrôle d'accès (\`src/lib/permissions\`).
 */
import type { ActionAPIContext } from "astro:actions";
import { requireActionPermission } from "@/lib/effect/action";

export type ${pascal}Permission = "create" | "read" | "update" | "publish" | "delete";

export const require${pascal}Permission = (context: ActionAPIContext, permissions: readonly ${pascal}Permission[]) =>
  requireActionPermission(context, { "${name}": [...permissions] });
`,

  [`${moduleDir}/services/${entity}.service.ts`]: `/**
 * Service Effect du domaine ${name} : mutations (création, mise à jour,
 * transition de workflow, verrou). Accès base via \`dbTry\` (DbError typé),
 * verrou via core/locks, transitions via core/workflow, révisions à chaque écriture.
 */
import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { dbTry } from "@/lib/effect/run";
import { fail } from "@/lib/effect/action";
import { canTransition } from "@/core/workflow";
import type { LockOwner } from "@/core/locks/policy";
import { ${camel}, ${camel}Revisions } from "../schema";
import { ${camel}Lock } from "../locks";
import { ${camel}Workflow, type ${pascal}Status } from "../domain/workflow";

type Row = typeof ${camel}.$inferSelect;

const findById = (id: string) =>
  dbTry("${name}.findById", () => getDrizzle().select().from(${camel}).where(eq(${camel}.id, id)).limit(1)).pipe(Effect.map((rows): Row | null => rows[0] ?? null));

const required = (id: string) =>
  Effect.flatMap(findById(id), (row) => (row ? Effect.succeed(row) : fail("NOT_FOUND", "Élément introuvable.")));

const revision = (row: Row, authorId: string, note: string) =>
  dbTry("${name}.revision", () => getDrizzle().insert(${camel}Revisions).values({ resourceId: row.id, authorId, title: row.title, slug: row.slug, status: row.status, note }));

export const ${camel}Service = {
  create: (input: { title: string; slug: string; organizationId: string | null }, authorId: string) =>
    Effect.gen(function* () {
      const [row] = yield* dbTry("${name}.create", () => getDrizzle().insert(${camel}).values({ ...input, createdBy: authorId }).returning());
      yield* revision(row, authorId, "Création");
      return row;
    }),

  update: (id: string, patch: { title?: string; slug?: string }, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* ${camel}Lock.ensureNotLockedByOther(id, owner, locale);
      yield* required(id);
      const [row] = yield* dbTry("${name}.update", () => getDrizzle().update(${camel}).set(patch).where(eq(${camel}.id, id)).returning());
      yield* revision(row, owner.userId, "Mise à jour");
      return row;
    }),

  transition: (id: string, to: ${pascal}Status, owner: LockOwner, locale?: string) =>
    Effect.gen(function* () {
      yield* ${camel}Lock.ensureNotLockedByOther(id, owner, locale);
      const current = yield* required(id);
      if (!canTransition(${camel}Workflow, current.status, to)) return yield* fail("BAD_REQUEST", "Transition de statut invalide : " + current.status + " → " + to + ".");
      const [row] = yield* dbTry("${name}.transition", () => getDrizzle().update(${camel}).set({ status: to }).where(eq(${camel}.id, id)).returning());
      yield* revision(row, owner.userId, "Transition " + current.status + " → " + to);
      return row;
    }),

  lock: (id: string, owner: LockOwner, options: { takeOver?: boolean; locale?: string } = {}) => ${camel}Lock.acquire(id, owner, options),
  unlock: (id: string, owner: LockOwner) => ${camel}Lock.release(id, owner),
};
`,

  [`${moduleDir}/actions/index.ts`]: `/**
 * Actions Astro du domaine ${name} : prologue Effect (garde de permission,
 * verrou, validations) puis service. À ré-exporter depuis \`src/actions/index.ts\`.
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { effectHandler } from "@/lib/effect/action";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { require${pascal}Permission } from "../permissions";
import { ${camel}Service } from "../services/${entity}.service";
import { ${upper}_STATUSES } from "../domain/workflow";
import { bulk${pascal}Lifecycle } from "./bulk";

const idInput = z.object({ id: z.uuid() });

export const ${camel}Actions = {
  // Actions groupées (core/bulk) — voir ./bulk.ts.
  bulk: bulk${pascal}Lifecycle,
  create: defineAction({
    input: z.object({ title: z.string().min(1).max(200), slug: z.string().min(1).max(200), organizationId: z.string().nullable().default(null) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* require${pascal}Permission(context, ["create"]);
      return yield* ${camel}Service.create(input, user.id);
    })),
  }),
  update: defineAction({
    input: idInput.extend({ title: z.string().min(1).max(200).optional(), slug: z.string().min(1).max(200).optional() }),
    handler: effectHandler(({ id, ...patch }, context) => Effect.gen(function* () {
      const user = yield* require${pascal}Permission(context, ["update"]);
      return yield* ${camel}Service.update(id, patch, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  transition: defineAction({
    input: idInput.extend({ to: z.enum(${upper}_STATUSES) }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* require${pascal}Permission(context, input.to === "PUBLISHED" ? ["publish"] : ["update"]);
      return yield* ${camel}Service.transition(input.id, input.to, lockOwnerFrom(user.id, context.locals.session?.id), lockLocaleFrom(context.request.headers));
    })),
  }),
  lock: defineAction({
    input: idInput.extend({ takeOver: z.boolean().optional() }),
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* require${pascal}Permission(context, ["update"]);
      // Même utilisateur dans une autre session → LockHeldError { sameUser } : confirmer côté UI puis renvoyer takeOver.
      return yield* ${camel}Service.lock(input.id, lockOwnerFrom(user.id, context.locals.session?.id), { takeOver: input.takeOver, locale: lockLocaleFrom(context.request.headers) });
    })),
  }),
  unlock: defineAction({
    input: idInput,
    handler: effectHandler((input, context) => Effect.gen(function* () {
      const user = yield* require${pascal}Permission(context, ["update"]);
      yield* ${camel}Service.unlock(input.id, lockOwnerFrom(user.id, context.locals.session?.id));
      return { success: true };
    })),
  }),
};
`,

  [`${moduleDir}/actions/bulk.ts`]: `/**
 * Actions groupées du domaine ${name} sur le moteur générique \`src/core/bulk\` :
 * sélection validée (non vide, sans doublon, bornée), permission par opération,
 * périmètre tenant (hors périmètre → FORBIDDEN), verrous d'édition, transitions du
 * workflow par ligne (tout ou rien), une transaction, révision + audit par ligne
 * (batchId commun). Ids alignés sur \`admin/resource.ts\` (\`list.bulkActions\`).
 */
import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { Effect } from "effect";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDrizzle } from "@database/drizzle";
import { BulkActionError, DEFAULT_BULK_MAX_ITEMS, runBulkAction, type BulkOperationDefinition } from "@/core/bulk";
import { canTransition } from "@/core/workflow";
import { lockOwnerFrom } from "@/core/locks/service";
import { lockLocaleFrom } from "@/core/locks/errors";
import { logAuditEvent, extractIp } from "@/lib/audit";
import { ActionFailure, actionTry, effectHandler } from "@/lib/effect/action";
import { require${pascal}Permission, type ${pascal}Permission } from "../permissions";
import { ${camel}, ${camel}Revisions } from "../schema";
import { ${camel}Lock } from "../locks";
import { ${camel}Workflow, type ${pascal}Status } from "../domain/workflow";

type Row = typeof ${camel}.$inferSelect;
type Db = ReturnType<typeof getDrizzle>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Actor = { id: string };

export const ${upper}_BULK_OPERATIONS = ["publish", "unpublish", "archive", "restore"] as const;
export type ${pascal}BulkOperation = (typeof ${upper}_BULK_OPERATIONS)[number];

const TARGET: Record<${pascal}BulkOperation, ${pascal}Status> = { publish: "PUBLISHED", unpublish: "DRAFT", archive: "ARCHIVED", restore: "DRAFT" };
const PERMISSION: Record<${pascal}BulkOperation, ${pascal}Permission> = { publish: "publish", unpublish: "publish", archive: "update", restore: "update" };

const transition = (op: ${pascal}BulkOperation): BulkOperationDefinition<Row, Tx, Actor> => ({
  validate: (row) => (canTransition(${camel}Workflow, row.status, TARGET[op]) ? null : "Transition de statut invalide : " + row.status + " → " + TARGET[op] + "."),
  apply: async (tx, row, actor) => {
    await tx.update(${camel}).set({ status: TARGET[op] }).where(eq(${camel}.id, row.id));
    await tx.insert(${camel}Revisions).values({ resourceId: row.id, authorId: actor.id, title: row.title, slug: row.slug, status: TARGET[op], note: "Action groupée : " + op });
  },
  auditAction: "BULK_ACTION",
  auditMetadata: (row) => ({ operation: op, from: row.status, to: TARGET[op] }),
  confirmationKey: op === "archive" ? "${name}.bulk.archive" : undefined,
});

export const ${camel}BulkOperations = Object.fromEntries(${upper}_BULK_OPERATIONS.map((op) => [op, transition(op)])) as Record<${pascal}BulkOperation, BulkOperationDefinition<Row, Tx, Actor>>;

export const bulk${pascal}Lifecycle = defineAction({
  input: z.object({ ids: z.array(z.uuid()).min(1).max(DEFAULT_BULK_MAX_ITEMS), organizationId: z.string().nullable().default(null), operation: z.enum(${upper}_BULK_OPERATIONS) }),
  handler: effectHandler((input, context) => {
    const db = getDrizzle();
    const inTenant = input.organizationId === null ? isNull(${camel}.organizationId) : eq(${camel}.organizationId, input.organizationId);
    return runBulkAction({
      resource: "${snake}",
      operations: ${camel}BulkOperations,
      authorize: (op: ${pascal}BulkOperation) => require${pascal}Permission(context, [PERMISSION[op]]).pipe(Effect.map((user) => ({ id: user.id }))),
      load: (ids) => actionTry("${name}.bulk.load", () => db.select().from(${camel}).where(and(inTenant, inArray(${camel}.id, [...ids])))),
      guard: (ids, actor) => ${camel}Lock.ensureNoneLockedByOther(ids, lockOwnerFrom(actor.id, context.locals.session?.id), lockLocaleFrom(context.request.headers)),
      transaction: (body) => db.transaction((tx) => body(tx)),
      audit: (actor, _action, entry) => void logAuditEvent({ userId: actor.id, action: "BULK_ACTION", ...entry, ipAddress: extractIp(context.request.headers, context.clientAddress), userAgent: context.request.headers.get("user-agent") }),
    }, { ids: input.ids, operation: input.operation }).pipe(
      Effect.mapError((e) => (e instanceof BulkActionError ? new ActionFailure({ code: e.code, message: e.message }) : e)),
      Effect.map((result) => ({ updated: result.updated, batchId: result.batchId })),
    );
  }),
});
`,

  // ── Composants ────────────────────────────────────────────────────────
  [`${compDir}/${pascal}Card.astro`]: `---
/**
 * Carte de liste du domaine ${name}.
 *
 * Présentational : les données viennent des props, jamais d'une requête. Le
 * script, s'il y en a un, passe par \`modules/${name}/client/\`.
 */
interface Props {
  id: string;
  title: string;
  href: string;
}

const { title, href } = Astro.props as Props;
---

<article class="rounded-2xl border bg-card p-5">
  <h3 class="font-heading font-semibold">
    <a href={href} class="hover:underline">{title}</a>
  </h3>
</article>
`,

  [`${compDir}/${pascal}Detail.astro`]: `---
/**
 * Page de détail du domaine ${name}.
 *
 * La DTO arrive par props : la page a fait appel au loader. Ce composant se
 * contente de composer les atomes de \`molecules/\`.
 */
import type { ${pascal}DTO } from "@/modules/${name}/loaders/${entity}.loader";
import ${pascal}Card from "@/components/${name}/${pascal}Card.astro";

interface Props {
  item: ${pascal}DTO;
}

const { item } = Astro.props as Props;
---

<section class="flex flex-col gap-6">
  <${pascal}Card id={item.id} title={item.id} href="#" />
</section>

<script>
  import { init${pascal} } from "@/modules/${name}/client/init";

  init${pascal}();
  document.addEventListener("astro:after-swap", init${pascal});
</script>
`,

  [`${compDir}/admin/${pascal}AdminList.astro`]: `---
/**
 * Liste back-office du domaine ${name}.
 *
 * Les mutations passent par un module client : un \`<form method="post">\` enverrait
 * un GET vers l'URL courante, ce qui exposerait les valeurs saisies dans la
 * chaîne de requête, l'historique et les journaux.
 *
 * Actions groupées : barre générique \`AdminBulkBar\` (core/bulk) — cases par ligne,
 * case « page », compteur annoncé, confirmation modale. Les opérations affichées sont
 * celles de la ressource admin, filtrées par la page selon les permissions.
 *
 * Facettes et vues enregistrées (core/filters) : passer \`baseUrl\` (Astro.url), les
 * comptes de \`load${pascal}AdminFacets\` et les vues de \`loadSavedViews(userId, "${entity}", organizationId)\`.
 */
import AdminFacets from "@organisms/AdminFacets.astro";
import AdminSavedViews from "@organisms/AdminSavedViews.astro";
import { canonicalListQuery, facetLinks, type FacetBucket } from "@/core/filters";
import { ${entityCamel}AdminResource } from "@/modules/${name}/admin/resource";
import ForceReleaseLockButton from "@/components/admin/ForceReleaseLockButton.astro";
import AdminBulkBar from "@organisms/AdminBulkBar.astro";
import type { AdminBulkBarOperation } from "@/core/bulk/ui";
import { formatBulk, getBulkUiTranslations } from "@/core/bulk/i18n";
import type { Locale } from "@i18n/config";

interface Props {
  items: Array<{ id: string; title: string; lockedByOther?: boolean }>;
  locale: Locale;
  organizationId?: string | null;
  /** Opérations groupées autorisées (dérivées de \`${entityCamel}AdminResource.list.bulkActions\`). */
  bulkOperations?: AdminBulkBarOperation[];
  /** Calculé par la page : \`canAdministerTenant(Astro.locals.user, organizationId)\` (core/permissions/tenant). */
  canForceReleaseLock?: boolean;
  /** URL courante (Astro.url) : active facettes et vues enregistrées. */
  baseUrl?: URL;
  /** Comptes de facettes (\`load${pascal}AdminFacets\`), chacune sans son propre filtre. */
  facets?: Record<string, readonly FacetBucket[]>;
  /** Vues enregistrées de l'utilisateur pour la ressource « ${entity} ». */
  savedViews?: readonly { id: string; name: string; query: string }[];
}

const { items, locale, organizationId = null, bulkOperations = [], canForceReleaseLock = false, baseUrl, facets = {}, savedViews = [] } = Astro.props as Props;
const bulkT = getBulkUiTranslations(locale);
const bulkEnabled = bulkOperations.length > 0;
const listDefinition = ${entityCamel}AdminResource.list!;
const listBaseUrl = baseUrl?.pathname ?? "";
const currentQuery = baseUrl ? canonicalListQuery(listDefinition, baseUrl.searchParams) : "";
// Libellés à traduire avec les autres libellés du module (modules/${name}/i18n/).
const facetGroups = baseUrl ? [{ id: "status", label: "Statut", links: facetLinks(listDefinition, currentQuery, "status", facets.status ?? [], listBaseUrl) }] : [];
const hasFilters = [...new URLSearchParams(currentQuery).keys()].some((key) => key !== "sortBy" && key !== "sortOrder" && key !== "page");
---

{baseUrl && (
  <>
    <AdminFacets locale={locale} groups={facetGroups} clearHref={hasFilters ? listBaseUrl : null} />
    <AdminSavedViews locale={locale} resource="${entity}" organizationId={organizationId} views={savedViews} baseUrl={listBaseUrl} currentQuery={currentQuery} />
  </>
)}

<AdminBulkBar action="${camel}.bulk" locale={locale} organizationId={organizationId} operations={bulkOperations}>
  <div class="flex flex-col gap-4">
    {items.length === 0 ? (
      <p class="text-sm text-muted-foreground">Aucun élément.</p>
    ) : (
      <>
        {bulkEnabled && <label class="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" class="size-6" data-bulk-page />{bulkT.selectPage}</label>}
        <ul class="flex flex-col gap-2">
          {items.map((item) => (
            <li class="flex items-center justify-between gap-3 border px-4 py-3">
              {bulkEnabled ? (
                <label class="flex min-h-11 items-center gap-2"><input type="checkbox" class="size-6" data-bulk-item value={item.id} aria-label={formatBulk(bulkT.selectRow, { title: item.title })} />{item.title}</label>
              ) : item.title}
              {canForceReleaseLock && item.lockedByOther && <ForceReleaseLockButton resourceType="${name}" resourceId={item.id} locale={locale} />}
            </li>
          ))}
        </ul>
      </>
    )}
  </div>
</AdminBulkBar>
`,
};

const optionalDirs = [
  "actions",
  "engagement",
  "i18n",
  "repositories",
  "search",
  "seo",
  "utils",
  "validation",
];

for (const [file, content] of Object.entries(files)) {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content, "utf8");
  console.log(`  ${file}`);
}

console.log(`
Module « ${name} » généré.

Étapes suivantes :
  1. exporter le schéma et générer la migration  (src/modules/${name}/schema → src/database/schemas.ts, pnpm db:generate)
     puis déclarer le namespace « ${name} » dans le contrôle d'accès (permissions/index.ts)
     compléter ${camel}Loader / load${pascal}()      (src/modules/${name}/loaders/${entity}.loader.ts)
  2. déclarer les capacités réelles         (capabilities.ts + module.ts)
  3. ajouter les libellés des 4 locales     (modules/${name}/i18n/)
  4. ré-exporter les actions générées      (modules/${name}/actions/index.ts → src/actions/index.ts)
  5. si le domaine a des avis/commentaires : engagement/ + components/${name}/engagement/
     (copier la forme de blog, services ou trips — les trois sont alignés)
  6. enregistrer la page                    (src/pages/[lang]/${name}/[slug].astro)
  7. vues enregistrées : inscrire « ${entity} » (src/lib/admin/list-registry.ts → ADMIN_LISTS)
     facettes : load${pascal}AdminFacets() + baseUrl/facets/savedViews sur ${pascal}AdminList

Dossiers optionnels, à créer SEULEMENT si utilisés : ${optionalDirs.join(", ")}
`);
