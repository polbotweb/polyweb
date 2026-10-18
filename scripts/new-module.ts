/**
 * Génère un module conforme à `docs/cms/module-system.md` (repris d'atlaselle).
 *
 *   pnpm module:new <domaine> [--entity=entityName]
 *
 * Ne crée QUE ce qui est obligatoire : un dossier vide est une dette. Les
 * dossiers optionnels (`engagement/`, `repositories/`, `seo/`, …) s'ajoutent
 * quand on en a besoin, pas d'avance.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const entityFlag = args.find((a) => a.startsWith("--entity="));
const rootFlag = args.find((a) => a.startsWith("--root="));

if (!name) {
  console.error("usage: pnpm module:new <domaine> [--entity=entite]");
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

// `--root=<dir>` permet de générer ailleurs que dans `src/` (tests, essais).
const root = rootFlag?.split("=")[1] ?? "src";
const moduleDir = join(root, "modules", name);
const compDir = join(root, "components", name);

if (existsSync(moduleDir) || existsSync(compDir)) {
  console.error(`"${name}" existe déjà — rien n'a été écrit.`);
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
    publication: false,
    revisions: false,
    locks: false,
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
} as unknown as PolywebModuleCapabilityProviders;
`,

  [`${moduleDir}/loaders/${entity}.loader.ts`]: `/**
 * Lecture du domaine ${name}.
 *
 * SEUL endroit autorisé à interroger la base pour ce domaine. Chaque fonction
 * retourne un objet nommé : les composants reçoivent des DTO, jamais des
 * lignes brutes, et le SQL reste testable hors rendu.
 */
import { getDrizzle } from "@database/drizzle";

/** DTO public du domaine. */
export interface ${pascal}DTO {
  id: string;
}

/**
 * @param id identifiant de l'objet
 * @param viewerId lecteur connecté, ou null pour un visiteur anonyme. Les
 *   données dépendant de la session ne doivent pas passer par un cache public.
 */
export async function load${pascal}(
  id: string,
  viewerId: string | null,
): Promise<${pascal}DTO | null> {
  const db = getDrizzle();
  void db;
  void viewerId;

  // TODO: implémenter la lecture.
  //   - filtrer sur le statut publié si le domaine a une notion de publication
  //   - ne jamais retourner un brouillon à un visiteur non autorisé
  return null;
}
`,

  [`${moduleDir}/loaders/index.ts`]: `export * from "./${entity}.loader";
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

/**
 * Définition de la liste back-office.
 *
 * Chaque filtre et chaque tri porte un \`queryParam\` : c'est lui que la liste
 * lit dans l'URL, ce qui rend une vue filtrée partageable par lien.
 * \`assertAdminResourceListDefinition\` valide qu'aucun identifiant n'est
 * dupliqué et que \`defaultSort\` désigne un tri déclaré.
 */
const ${entityCamel}ListDefinition = {
  filters: [{ id: "search", kind: "search", queryParam: "search" }],
  sorts: [{ id: "createdAt", queryParam: "sortBy", directions: ["asc", "desc"] }],
  defaultSort: "createdAt",
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
    bulk: false,
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
 */
interface Props {
  items: Array<{ id: string; title: string }>;
}

const { items } = Astro.props as Props;
---

<div class="flex flex-col gap-4">
  {items.length === 0 ? (
    <p class="text-sm text-muted-foreground">Aucun élément.</p>
  ) : (
    <ul class="flex flex-col gap-2">
      {items.map((item) => (
        <li class="flex items-center justify-between border px-4 py-3">{item.title}</li>
      ))}
    </ul>
  )}
</div>
`,
};

const optionalDirs = [
  "actions",
  "domain",
  "engagement",
  "i18n",
  "permissions",
  "repositories",
  "schema",
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
  1. implémenter load${pascal}()            (src/modules/${name}/loaders/${entity}.loader.ts)
  2. déclarer les capacités réelles         (capabilities.ts + module.ts)
  3. ajouter les libellés des 4 locales     (modules/${name}/i18n/)
  4. enchaîner les actions                  (src/actions/${name}/ + modules/${name}/actions/index.ts)
  5. si le domaine a des avis/commentaires : engagement/ + components/${name}/engagement/
     (copier la forme de blog, services ou trips — les trois sont alignés)
  6. enregistrer la page                    (src/pages/[lang]/${name}/[slug].astro)

Dossiers optionnels, à créer SEULEMENT si utilisés : ${optionalDirs.join(", ")}
`);
