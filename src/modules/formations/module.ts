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
import { formationsCapabilityProviders } from "./capabilities";

/**
 * Le contrat `PolywebModuleCapabilities` attend TOUTES les clés : une
 * capacité non listée est désactivée, donc il faut les écrire explicitement
 * plutôt que de ne mentionner que les actives.
 *
 * `assertModuleCapabilityProviders` refuse à l'exécution un module qui
 * active une capacité sans fournisseur, ou qui déclare une recherche sans
 * définition.
 */
export const formationsModule: PolywebModuleDefinition = {
  id: "formations",
  entity: "formation",
  capabilities: defineModuleCapabilities({
    content: true,
    localization: true,
    media: true,
    seo: false,
    taxonomy: true,
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
    formationsCapabilityProviders satisfies PolywebModuleCapabilityProviders,
  ),
  presentations: defineModulePresentations({
    card: ["default"],
    list: ["default"],
    single: ["default"],
    ui: [],
  }),
};

assertModuleCapabilityProviders(formationsModule);
