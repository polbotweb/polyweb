/**
 * Contrat des plugins Polyweb (brique i).
 *
 * Un plugin est un module TypeScript installé dans `src/plugins/<id>/` et
 * déclaré dans `src/plugins/index.ts`. Il est activé/désactivé et configuré
 * depuis l'admin ; son `setup` est un programme Effect qui reçoit un contexte
 * restreint (blocs, événements, nettoyage). Tout ce qu'il enregistre est
 * automatiquement retiré à la désactivation.
 */
import { Data, type Effect, type Schema } from 'effect';
import type { BlockDefinition } from '@/core/blocks/registry';
import type { PolywebEvent, PolywebEventName } from '@/core/events';
import type { AppServices } from '@/lib/effect/runtime';

export class PluginSetupError extends Data.TaggedError('PluginSetupError')<{ readonly pluginId: string; readonly reason: string; readonly cause?: unknown }> {
  override get message() {
    return `Plugin ${this.pluginId}: ${this.reason}`;
  }
}

export interface PluginSettingField {
  readonly name: string;
  readonly label: string;
  readonly kind: 'text' | 'textarea' | 'email' | 'number' | 'boolean';
  readonly help?: string;
}

export interface PluginSettings<S> {
  /** Schéma Effect des réglages (valeurs décodées depuis le formulaire admin / la base). */
  readonly schema: Schema.Decoder<S, never>;
  readonly defaults: S;
  /** Description des champs pour le formulaire d'admin généré. */
  readonly fields: readonly PluginSettingField[];
}

export type PluginEventHandler = (event: PolywebEvent) => Effect.Effect<void, unknown, AppServices>;

export interface PluginContext<S> {
  readonly pluginId: string;
  readonly settings: S;
  /** Enregistre un bloc (son `source` est forcé à l'id du plugin). */
  readonly registerBlock: <T>(def: BlockDefinition<T>) => Effect.Effect<void, PluginSetupError>;
  /** Abonne un handler Effect à un événement (exécuté avec délai maximal, erreurs isolées). */
  readonly on: (event: PolywebEventName | '*', handler: PluginEventHandler) => Effect.Effect<void>;
  /** Ajoute une action de nettoyage exécutée à la désactivation. */
  readonly addCleanup: (cleanup: () => void) => Effect.Effect<void>;
}

export interface PluginDefinition<S = Record<string, never>> {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly settings?: PluginSettings<S>;
  readonly setup: (ctx: PluginContext<S>) => Effect.Effect<void, PluginSetupError, AppServices>;
}

/** Aide au typage : `export default definePlugin({ ... })`. */
export function definePlugin<S = Record<string, never>>(def: PluginDefinition<S>): PluginDefinition<S> {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(def.id)) throw new Error(`Identifiant de plugin invalide : ${def.id}`);
  return def;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPlugin = PluginDefinition<any>;
