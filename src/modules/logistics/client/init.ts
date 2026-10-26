/**
 * Point d'entrée navigateur du domaine logistics. Les composants n'importent QUE ce fichier —
 * jamais `astro:actions` directement. Idempotent : premier rendu puis `astro:after-swap`.
 */
import { initLogisticsForms } from "./forms";
import { initLogisticsRecord } from "./record-actions";

export function initLogistics(): void {
  initLogisticsForms();
  initLogisticsRecord();
}
