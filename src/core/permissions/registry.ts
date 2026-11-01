/**
 * Registre des permissions par module (core, générique).
 *
 * Chaque module déclare dans `src/modules/<module>/permissions/statements.ts` :
 * - `statements` : ses namespaces et actions (contrôle d'accès Better Auth) ;
 * - `grants` : ce que reçoit chaque rôle prédéfini (global : admin / editor / user ;
 *   organisation : orgOwner / orgAdmin / orgMember).
 *
 * `src/modules/permissions.ts` agrège les définitions ; `src/lib/permissions.ts` les fusionne
 * avec les statements du core. Un namespace déclaré deux fois, ou une action accordée sans être
 * déclarée, est une erreur au chargement (fail-fast).
 */
export type Statements = Readonly<Record<string, readonly string[]>>;

export const PREDEFINED_ROLES = ["admin", "editor", "user", "orgOwner", "orgAdmin", "orgMember"] as const;
export type PredefinedRole = (typeof PREDEFINED_ROLES)[number];

export interface ModulePermissionsDefinition<S extends Statements = Statements> {
  readonly module: string;
  /** Libellé court par défaut (fr) ; l'UI utilise les traductions si présentes. */
  readonly label: string;
  readonly statements: S;
  readonly grants: Partial<Record<PredefinedRole, { readonly [K in keyof S]?: readonly S[K][number][] }>>;
}

export const defineModulePermissions = <const S extends Statements>(def: ModulePermissionsDefinition<S>) => def;

/** Fusionne les statements ; un namespace en double est refusé. */
export function mergeStatements(core: Statements, modules: readonly ModulePermissionsDefinition[]): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = { ...core };
  for (const m of modules) {
    for (const [ns, actions] of Object.entries(m.statements)) {
      if (ns in out) throw new Error(`[permissions] namespace « ${ns} » déclaré deux fois (module ${m.module})`);
      out[ns] = actions;
    }
  }
  return out;
}

/** Statements accordés à un rôle prédéfini par l'ensemble des modules (validés contre les déclarations). */
export function moduleGrants(modules: readonly ModulePermissionsDefinition[], role: PredefinedRole): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of modules) {
    for (const [ns, actions] of Object.entries(m.grants[role] ?? {})) {
      const declared = m.statements[ns];
      if (!declared) throw new Error(`[permissions] ${m.module} accorde « ${ns} » sans le déclarer`);
      for (const a of actions as readonly string[]) {
        if (!declared.includes(a)) throw new Error(`[permissions] ${m.module} accorde « ${ns}:${a} » non déclaré`);
      }
      out[ns] = [...(actions as readonly string[])];
    }
  }
  return out;
}

/** Namespaces d'un module (pour l'UI de rôles). */
export const moduleNamespaces = (m: ModulePermissionsDefinition) => Object.keys(m.statements);
