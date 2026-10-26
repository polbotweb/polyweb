/**
 * Point d'entrée navigateur du domaine purchasing. Les composants n'importent QUE ce fichier —
 * jamais `astro:actions` directement. Idempotent : premier rendu puis `astro:after-swap`.
 */
import { initPurchasingForms } from "./forms";
import { initPurchasingRecord } from "./record-actions";

export function initPurchasing(): void {
  initPurchasingForms();
  initPurchasingRecord();
}
