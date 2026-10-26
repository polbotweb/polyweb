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
import { salesCapabilityProviders } from "./capabilities";

/**
 * Le contrat `PolywebModuleCapabilities` attend TOUTES les clés : une
 * capacité non listée est désactivée, donc il faut les écrire explicitement
 * plutôt que de ne mentionner que les actives.
 *
 * `assertModuleCapabilityProviders` refuse à l'exécution un module qui
 * active une capacité sans fournisseur, ou qui déclare une recherche sans
 * définition.
 */
export const salesModule: PolywebModuleDefinition = {
  id: "sales",
  entity: "salesDocument",
  capabilities: defineModuleCapabilities({
    content: true,
    localization: false,
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
    salesCapabilityProviders satisfies PolywebModuleCapabilityProviders,
  ),
  presentations: defineModulePresentations({
    card: ["default"],
    list: ["default"],
    single: ["default"],
    ui: [],
  }),
};

assertModuleCapabilityProviders(salesModule);
