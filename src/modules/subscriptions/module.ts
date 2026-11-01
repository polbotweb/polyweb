import type {
  PolywebModuleCapabilityProviders,
  PolywebModuleDefinition,
} from "@/core/modules/module-contract";
import {
  assertModuleCapabilityProviders,
  defineModuleCapabilities,
  defineModuleCapabilityProviders,
  defineModulePresentations,
} from "@/core/modules/module-contract";
import { subscriptionsCapabilityProviders } from "./capabilities";

/**
 * Le contrat `PolywebModuleCapabilities` attend TOUTES les clés : une
 * capacité non listée est désactivée, donc il faut les écrire explicitement
 * plutôt que de ne mentionner que les actives.
 *
 * `assertModuleCapabilityProviders` refuse à l'exécution un module qui
 * active une capacité sans fournisseur, ou qui déclare une recherche sans
 * définition.
 */
export const subscriptionsModule: PolywebModuleDefinition = {
  id: "subscriptions",
  entity: "subscription",
  capabilities: defineModuleCapabilities({
    content: true,
    localization: false,
    media: false,
    seo: false,
    taxonomy: true,
    attributes: false,
    search: false,
    publication: false,
    revisions: false,
    locks: false,
    engagement: false,
    moderation: false,
    notifications: false,
    audit: true,
    cache: false,
  }),
  capabilityProviders: defineModuleCapabilityProviders(
    subscriptionsCapabilityProviders satisfies PolywebModuleCapabilityProviders,
  ),
  presentations: defineModulePresentations({
    card: ["default"],
    list: ["default"],
    single: ["default"],
    ui: [],
  }),
};

assertModuleCapabilityProviders(subscriptionsModule);
