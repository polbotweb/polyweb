/**
 * Hôte des plugins (brique i) — Effect.
 *
 * - `syncPlugins` lit `plugin_states` et (dés)active les plugins installés pour
 *   refléter la base. Appelé par le middleware au plus toutes les
 *   PLUGINS_SYNC_INTERVAL_MS (30 s par défaut) : une activation faite sur une
 *   instance se propage aux autres sans redémarrage.
 * - Chaque `setup` tourne avec un délai maximal ; un échec est enregistré dans
 *   `last_error`, le plugin reste inactif et le reste du site continue.
 * - Tout ce qu'un plugin enregistre (blocs, abonnements) est retiré à la
 *   désactivation.
 */
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { schema } from '@database/drizzle';
import { query } from '@/lib/effect/db';
import { decode } from '@/lib/effect/schema';
import { NotFoundError, ValidationError } from '@/lib/effect/errors';
import { appRuntime, type AppServices } from '@/lib/effect/runtime';
import { registerBlock, unregisterBlock, getBlock } from '@/core/blocks/registry';
import { onEvent } from '@/core/events';
import { PluginSetupError, type AnyPlugin, type PluginContext } from './contract';

const SETUP_TIMEOUT_MS = 10_000;
const HANDLER_TIMEOUT_MS = Number(process.env.PLUGINS_HANDLER_TIMEOUT_MS ?? 15_000);

interface ActivePlugin {
  readonly settingsKey: string;
  readonly cleanups: Array<() => void>;
}

interface HostState {
  installed: readonly AnyPlugin[];
  active: Map<string, ActivePlugin>;
  errors: Map<string, string>;
  lastSync: number;
  syncing: Promise<void> | null;
  /** Exécuteur des handlers d'événements (remplaçable en test pour fournir des services factices). */
  runHandler: ((effect: Effect.Effect<void, never, AppServices>) => Promise<void>) | null;
}

const KEY = Symbol.for('polyweb.plugins.host');
const g = globalThis as unknown as Record<symbol, HostState | undefined>;
const state: HostState = (g[KEY] ??= { installed: [], active: new Map(), errors: new Map(), lastSync: 0, syncing: null, runHandler: null });

/** Déclare la liste des plugins installés (appelé par src/plugins/index.ts). */
export function setInstalledPlugins(plugins: readonly AnyPlugin[]): void {
  const ids = new Set<string>();
  for (const p of plugins) {
    if (ids.has(p.id)) throw new Error(`Plugin installé deux fois : ${p.id}`);
    ids.add(p.id);
  }
  state.installed = plugins;
}

export const installedPlugins = (): readonly AnyPlugin[] => state.installed;
export const isPluginActive = (id: string): boolean => state.active.has(id);

const findPlugin = (id: string) =>
  Effect.gen(function* () {
    const plugin = state.installed.find((p) => p.id === id);
    if (!plugin) return yield* new NotFoundError({ entity: 'plugin', id });
    return plugin;
  });

/** Réglages effectifs : valeurs par défaut + valeurs stockées, validées par le schéma du plugin. */
export const resolveSettings = (plugin: AnyPlugin, stored: unknown) =>
  plugin.settings ? decode(plugin.settings.schema)({ ...(plugin.settings.defaults as object), ...((stored as object) ?? {}) }) : Effect.succeed({});

const deactivate = (id: string) =>
  Effect.sync(() => {
    const active = state.active.get(id);
    if (!active) return;
    for (const cleanup of active.cleanups.reverse()) {
      try {
        cleanup();
      } catch (e) {
        console.error(`[plugins] cleanup failed for ${id}`, e);
      }
    }
    state.active.delete(id);
  });

const activate = (plugin: AnyPlugin, stored: unknown) =>
  Effect.gen(function* () {
    const settings = yield* resolveSettings(plugin, stored).pipe(
      Effect.mapError((e) => new PluginSetupError({ pluginId: plugin.id, reason: `réglages invalides — ${e.message}` })),
    );
    const cleanups: Array<() => void> = [];
    const ctx: PluginContext<unknown> = {
      pluginId: plugin.id,
      settings,
      registerBlock: (def) =>
        Effect.try({
          try: () => {
            registerBlock({ ...def, source: plugin.id });
            cleanups.push(() => {
              if (getBlock(def.type)?.source === plugin.id) unregisterBlock(def.type);
            });
          },
          catch: (cause) => new PluginSetupError({ pluginId: plugin.id, reason: cause instanceof Error ? cause.message : 'bloc refusé', cause }),
        }),
      on: (event, handler) =>
        Effect.sync(() => {
          const off = onEvent(event, (e) =>
            (state.runHandler ?? ((eff) => appRuntime.runPromise(eff)))(
              handler(e).pipe(
                Effect.timeout(HANDLER_TIMEOUT_MS),
                Effect.catchCause((cause) => Effect.logWarning(`[plugins] ${plugin.id} handler failed for ${e.name}`, cause)),
                Effect.withSpan('plugin.handler', { attributes: { plugin: plugin.id, event: e.name } }),
              ),
            ),
          );
          cleanups.push(off);
        }),
      addCleanup: (cleanup) => Effect.sync(() => void cleanups.push(cleanup)),
    };
    const setup = plugin.setup(ctx).pipe(
      Effect.timeoutOrElse({ duration: SETUP_TIMEOUT_MS, orElse: () => Effect.fail(new PluginSetupError({ pluginId: plugin.id, reason: 'délai de setup dépassé' })) }),
    );
    const exit = yield* Effect.exit(setup);
    if (exit._tag === 'Failure') {
      // Annule ce qui a pu être enregistré avant l'échec.
      for (const c of cleanups.reverse()) c();
      return yield* Effect.failCause(exit.cause);
    }
    state.active.set(plugin.id, { settingsKey: JSON.stringify(stored ?? {}), cleanups });
  }).pipe(Effect.withSpan('plugin.activate', { attributes: { plugin: plugin.id } }));

/** Aligne les plugins actifs sur la base. Ne lève jamais pour un plugin défaillant. */
export const syncPlugins = Effect.gen(function* () {
  const rows = yield* query('plugins.states', (db) => db.select().from(schema.pluginStates));
  const byId = new Map(rows.map((r) => [r.pluginId, r]));
  for (const plugin of state.installed) {
    const row = byId.get(plugin.id);
    const wanted = row?.enabled === true;
    const active = state.active.get(plugin.id);
    const key = JSON.stringify(row?.settings ?? {});
    if (!wanted) {
      yield* deactivate(plugin.id);
      state.errors.delete(plugin.id);
      if (row?.lastError) yield* query('plugins.clear-error', (db) => db.update(schema.pluginStates).set({ lastError: null }).where(eq(schema.pluginStates.pluginId, plugin.id)));
      continue;
    }
    if (active && active.settingsKey === key) continue;
    if (active) yield* deactivate(plugin.id);
    const result = yield* Effect.result(activate(plugin, row?.settings));
    if (result._tag === 'Failure') {
      const reason = result.failure.message;
      state.errors.set(plugin.id, reason);
      if (row?.lastError !== reason) yield* query('plugins.error', (db) => db.update(schema.pluginStates).set({ lastError: reason }).where(eq(schema.pluginStates.pluginId, plugin.id)));
      yield* Effect.logWarning(`[plugins] ${plugin.id} non activé : ${reason}`);
    } else {
      state.errors.delete(plugin.id);
      if (row?.lastError) yield* query('plugins.clear-error', (db) => db.update(schema.pluginStates).set({ lastError: null }).where(eq(schema.pluginStates.pluginId, plugin.id)));
    }
  }
  state.lastSync = Date.now();
});

const SYNC_INTERVAL_MS = Number(process.env.PLUGINS_SYNC_INTERVAL_MS ?? 30_000);

/** Pour le middleware : synchronise au plus toutes les SYNC_INTERVAL_MS, sans jamais faire échouer la requête. */
export async function ensurePluginsSynced(force = false): Promise<void> {
  if (state.installed.length === 0) return;
  if (!force && Date.now() - state.lastSync < SYNC_INTERVAL_MS) return;
  state.syncing ??= appRuntime
    .runPromise(syncPlugins)
    .catch((e) => {
      console.error('[plugins] sync failed', e);
      state.lastSync = Date.now();
    })
    .finally(() => {
      state.syncing = null;
    });
  await state.syncing;
}

export const listPlugins = Effect.gen(function* () {
  const rows = yield* query('plugins.states', (db) => db.select().from(schema.pluginStates));
  const byId = new Map(rows.map((r) => [r.pluginId, r]));
  return state.installed.map((p) => {
    const row = byId.get(p.id);
    return {
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      enabled: row?.enabled ?? false,
      active: state.active.has(p.id),
      error: state.errors.get(p.id) ?? row?.lastError ?? null,
      settings: { ...((p.settings?.defaults as object) ?? {}), ...(row?.settings ?? {}) } as Record<string, unknown>,
      fields: p.settings?.fields ?? [],
    };
  });
});

/** Active/désactive puis synchronise immédiatement cette instance ; renvoie l'erreur éventuelle de setup. */
export const setPluginEnabled = (id: string, enabled: boolean, userId: string | null) =>
  Effect.gen(function* () {
    yield* findPlugin(id);
    yield* query('plugins.toggle', (db) =>
      db
        .insert(schema.pluginStates)
        .values({ pluginId: id, enabled, updatedBy: userId })
        .onConflictDoUpdate({ target: schema.pluginStates.pluginId, set: { enabled, updatedBy: userId, updatedAt: new Date() } }),
    );
    yield* syncPlugins;
    return state.errors.get(id) ?? null;
  });

/** Convertit les valeurs d'un formulaire selon les champs déclarés (cases à cocher, nombres). */
export function settingsFromForm(plugin: AnyPlugin, form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of plugin.settings?.fields ?? []) {
    const raw = form.get(f.name);
    if (f.kind === 'boolean') out[f.name] = raw === 'on' || raw === 'true';
    else if (f.kind === 'number') out[f.name] = raw === null || raw === '' ? undefined : Number(raw);
    else out[f.name] = typeof raw === 'string' ? raw : '';
  }
  return out;
}

/** Valide puis enregistre les réglages (ValidationError si le schéma du plugin les refuse). */
export const savePluginSettings = (id: string, input: Record<string, unknown>, userId: string | null) =>
  Effect.gen(function* () {
    const plugin = yield* findPlugin(id);
    if (!plugin.settings) return yield* new ValidationError({ issues: [{ path: '', message: 'Ce plugin n’a pas de réglages' }] });
    const settings = (yield* resolveSettings(plugin, input)) as Record<string, unknown>;
    // On stocke la forme encodée (JSON simple) pour pouvoir la redécoder.
    const encoded = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
    yield* query('plugins.settings', (db) =>
      db
        .insert(schema.pluginStates)
        .values({ pluginId: id, settings: encoded, updatedBy: userId })
        .onConflictDoUpdate({ target: schema.pluginStates.pluginId, set: { settings: encoded, updatedBy: userId, updatedAt: new Date() } }),
    );
    yield* syncPlugins;
    return { settings, error: state.errors.get(id) ?? null };
  });

/** Tests uniquement. */
export function setPluginHandlerRunnerForTests(run: HostState['runHandler']): void {
  state.runHandler = run;
}
export const resetPluginHostForTests = Effect.gen(function* () {
  for (const id of [...state.active.keys()]) yield* deactivate(id);
  state.errors.clear();
  state.lastSync = 0;
});
