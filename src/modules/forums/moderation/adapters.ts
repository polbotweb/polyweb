/**
 * Cibles de modération du module forums (registre core `moderation/registry`, docs/moderation.md),
 * inscrites dans src/modules/moderation.ts. Ajouter un adaptateur par type modérable :
 * `load` (organisation, auteur, statut, visibilité publique), `excerpt` (modérateurs seulement),
 * `apply` (hide / restore / spam sur le statut métier, dans la transaction fournie) ;
 * sans `apply`, la cible n'accepte que le traitement des signalements.
 */
import { defineModuleModeration } from "@/core/moderation/registry";

export const forumsModeration = defineModuleModeration("forums", []);
