/**
 * Point d'entrée navigateur du domaine crm. Les composants n'importent QUE ce fichier —
 * jamais `astro:actions` directement. Idempotent : premier rendu puis `astro:after-swap`.
 */
import { initCrmForms } from "./forms";
import { initCrmRecord } from "./record-actions";

export function initCrm(): void {
  initCrmForms();
  initCrmRecord();
}
